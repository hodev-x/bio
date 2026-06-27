/**
 * One-time operator script: generate and store the auth secrets for an environment in SSM
 * (SecureString). Run locally with AWS credentials, e.g.:
 *
 *   AWS_PROFILE=bio pnpm --filter @bio/api exec tsx scripts/provision-secrets.ts --env staging
 *
 * It writes (overwriting any existing values):
 *   /bio/<env>/jwt-signing-key         the HMAC signing key (stays server-side)
 *   /bio/<env>/mcp-client-secret-hash  scrypt hash of the MCP client secret
 *   /bio/<env>/passkey-bootstrap-token one-time token to register the first passkey
 *
 * The MCP client secret (plaintext) and the bootstrap token are printed ONCE — save them now.
 * The MCP secret goes into the MCP server config (BIO_API_KEY); it is never recoverable later.
 */
import { randomBytes } from "node:crypto";
import { SSMClient, PutParameterCommand } from "@aws-sdk/client-ssm";
import { hashSecret } from "../src/auth/hash.js";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing required --${name}`);
}

async function putSecure(ssm: SSMClient, name: string, value: string): Promise<void> {
  await ssm.send(
    new PutParameterCommand({ Name: name, Value: value, Type: "SecureString", Overwrite: true }),
  );
}

async function main(): Promise<void> {
  const env = arg("env", "staging");
  if (!["staging", "prod"].includes(env)) throw new Error(`--env must be staging|prod (got ${env})`);
  const prefix = `/bio/${env}`;
  const ssm = new SSMClient({});

  const jwtSigningKey = randomBytes(48).toString("base64url"); // 64 chars, > 32 min
  const mcpSecret = `bio_mcp_${randomBytes(32).toString("base64url")}`;
  const bootstrapToken = randomBytes(24).toString("base64url");
  const mcpSecretHash = await hashSecret(mcpSecret);

  await putSecure(ssm, `${prefix}/jwt-signing-key`, jwtSigningKey);
  await putSecure(ssm, `${prefix}/mcp-client-secret-hash`, mcpSecretHash);
  await putSecure(ssm, `${prefix}/passkey-bootstrap-token`, bootstrapToken);

  // Secrets the operator must save now — printed once, not stored in plaintext anywhere central.
  console.log(`\n✅ Provisioned auth secrets for ${env} (${prefix}/*)\n`);
  console.log("Save these now — they cannot be recovered:\n");
  console.log(`  MCP client secret (BIO_API_KEY):  ${mcpSecret}`);
  console.log(`  Passkey bootstrap token:          ${bootstrapToken}\n`);
  console.log("The JWT signing key was stored server-side only (not printed).\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
