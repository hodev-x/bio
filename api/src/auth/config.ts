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
  const ssm = client ?? new SSMClient({});
  const prefix = process.env.SSM_PREFIX ?? "/bio/staging";
  const names = [`${prefix}/jwt-signing-key`, `${prefix}/mcp-client-secret-hash`, `${prefix}/passkey-bootstrap-token`];
  const out = await ssm.send(new GetParametersCommand({ Names: names, WithDecryption: true }));
  const get = (n: string) => out.Parameters?.find((p) => p.Name === n)?.Value ?? "";
  cache = {
    jwtSigningKey: get(names[0]),
    mcpClientSecretHash: get(names[1]),
    passkeyBootstrapToken: get(names[2]),
  };
  return cache;
}
