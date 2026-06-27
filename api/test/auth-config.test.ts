import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";
import { loadAuthConfig, _resetAuthConfigCache } from "../src/auth/config.js";

const ssm = mockClient(SSMClient);
beforeEach(() => { ssm.reset(); _resetAuthConfigCache(); process.env.SSM_PREFIX = "/bio/staging"; });

describe("loadAuthConfig", () => {
  it("loads the three params and caches them (one SSM call)", async () => {
    ssm.on(GetParametersCommand).resolves({
      Parameters: [
        { Name: "/bio/staging/jwt-signing-key", Value: "the-key" },
        { Name: "/bio/staging/mcp-client-secret-hash", Value: "salt:hash" },
        { Name: "/bio/staging/passkey-bootstrap-token", Value: "boot" },
      ],
    });
    const a = await loadAuthConfig(ssm as unknown as SSMClient);
    expect(a.jwtSigningKey).toBe("the-key");
    expect(a.mcpClientSecretHash).toBe("salt:hash");
    expect(a.passkeyBootstrapToken).toBe("boot");
    await loadAuthConfig(ssm as unknown as SSMClient); // cached
    expect(ssm.commandCalls(GetParametersCommand)).toHaveLength(1);
  });
});
