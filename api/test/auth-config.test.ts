import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";
import { loadAuthConfig, _resetAuthConfigCache } from "../src/auth/config.js";

const ssm = mockClient(SSMClient);
beforeEach(() => { ssm.reset(); _resetAuthConfigCache(); process.env.SSM_PREFIX = "/bio/staging"; });

const KEY32 = "signing-key-at-least-32-bytes-long-xxx";

describe("loadAuthConfig", () => {
  it("loads the three params and caches them (one SSM call)", async () => {
    ssm.on(GetParametersCommand).resolves({
      Parameters: [
        { Name: "/bio/staging/jwt-signing-key", Value: KEY32 },
        { Name: "/bio/staging/mcp-client-secret-hash", Value: "salt:hash" },
        { Name: "/bio/staging/passkey-bootstrap-token", Value: "boot" },
      ],
    });
    const a = await loadAuthConfig(ssm as unknown as SSMClient);
    expect(a.jwtSigningKey).toBe(KEY32);
    expect(a.mcpClientSecretHash).toBe("salt:hash");
    expect(a.passkeyBootstrapToken).toBe("boot");
    await loadAuthConfig(ssm as unknown as SSMClient); // cached
    expect(ssm.commandCalls(GetParametersCommand)).toHaveLength(1);
  });

  it("throws if the signing key is still the CDK placeholder", async () => {
    ssm.on(GetParametersCommand).resolves({
      Parameters: [
        { Name: "/bio/staging/jwt-signing-key", Value: "PLACEHOLDER-set-by-provision-script" },
        { Name: "/bio/staging/mcp-client-secret-hash", Value: "salt:hash" },
        { Name: "/bio/staging/passkey-bootstrap-token", Value: "boot" },
      ],
    });
    await expect(loadAuthConfig(ssm as unknown as SSMClient)).rejects.toThrow(/placeholder/i);
  });

  it("throws if a param is missing (empty)", async () => {
    ssm.on(GetParametersCommand).resolves({ Parameters: [] });
    await expect(loadAuthConfig(ssm as unknown as SSMClient)).rejects.toThrow();
  });

  it("throws if SSM_PREFIX is unset", async () => {
    delete process.env.SSM_PREFIX;
    await expect(loadAuthConfig(ssm as unknown as SSMClient)).rejects.toThrow(/SSM_PREFIX/);
  });
});
