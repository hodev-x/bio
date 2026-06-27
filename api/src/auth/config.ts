import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";

export interface AuthConfig {
  jwtSigningKey: string;
  mcpClientSecretHash: string;
  passkeyBootstrapToken: string;
}

let cache: AuthConfig | null = null;
export function _resetAuthConfigCache() { cache = null; }

export async function loadAuthConfig(client?: SSMClient): Promise<AuthConfig> {
  if (cache) return cache;
  const prefix = process.env.SSM_PREFIX;
  if (!prefix) throw new Error("[auth/config] SSM_PREFIX env var is required");
  const ssm = client ?? new SSMClient({});
  const names = [`${prefix}/jwt-signing-key`, `${prefix}/mcp-client-secret-hash`, `${prefix}/passkey-bootstrap-token`];
  const out = await ssm.send(new GetParametersCommand({ Names: names, WithDecryption: true }));
  const get = (n: string) => out.Parameters?.find((p) => p.Name === n)?.Value ?? "";
  const jwtSigningKey = get(names[0]);
  const mcpClientSecretHash = get(names[1]);
  const passkeyBootstrapToken = get(names[2]);

  // Fail loud rather than run degraded: an empty or still-placeholder HS256 key lets anyone
  // forge tokens (issuer/audience are public). The CDK seeds "PLACEHOLDER-..." values; the
  // provision script must run before a real deploy. The placeholder is >32 chars, so an explicit
  // prefix check is required in addition to a length check.
  for (const [name, value] of [
    ["jwt-signing-key", jwtSigningKey],
    ["mcp-client-secret-hash", mcpClientSecretHash],
    ["passkey-bootstrap-token", passkeyBootstrapToken],
  ] as const) {
    if (!value || value.startsWith("PLACEHOLDER")) {
      throw new Error(`[auth/config] ${name} is unset or still a placeholder (${prefix}/${name}) — run the provision script for this env`);
    }
  }
  if (jwtSigningKey.length < 32) {
    throw new Error("[auth/config] jwt-signing-key must be at least 32 characters");
  }

  cache = { jwtSigningKey, mcpClientSecretHash, passkeyBootstrapToken };
  return cache;
}
