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
 *   /bio/<env>/origin-verify           shared secret CloudFront forwards as x-origin-verify
 *
 * Pass --only <param-name> (e.g. --only origin-verify) to write just that one parameter
 * without re-minting the others.
 *
 * The MCP client secret (plaintext) and the bootstrap token are printed ONCE — save them now.
 * The MCP secret goes into the MCP server config (BIO_API_KEY); it is never recoverable later.
 */
import { randomBytes } from "node:crypto";
import { SSMClient, PutParameterCommand } from "@aws-sdk/client-ssm";
import { hashSecret } from "../src/auth/hash.js";

const PARAM_NAMES = ["jwt-signing-key", "mcp-client-secret-hash", "passkey-bootstrap-token", "origin-verify"] as const;
type ParamName = (typeof PARAM_NAMES)[number];

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing required --${name}`);
}

export function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const value = process.argv[i + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`--${name} requires a value (usage: --${name} <value>) — omit the flag entirely to write everything`);
  }
  return value;
}

async function putSecure(ssm: SSMClient, name: string, value: string): Promise<void> {
  await ssm.send(
    new PutParameterCommand({ Name: name, Value: value, Type: "SecureString", Overwrite: true }),
  );
}

async function main(): Promise<void> {
  const env = arg("env", "staging");
  if (!["staging", "prod"].includes(env)) throw new Error(`--env must be staging|prod (got ${env})`);
  const only = flag("only");
  if (only !== undefined && !(PARAM_NAMES as readonly string[]).includes(only)) {
    throw new Error(`--only must be one of ${PARAM_NAMES.join(", ")} (got ${only})`);
  }
  const wants = (name: ParamName) => only === undefined || only === name;
  const prefix = `/bio/${env}`;
  const ssm = new SSMClient({});

  if (wants("origin-verify")) {
    const originVerifySecret = randomBytes(24).toString("hex");
    // Type: "String" (not SecureString) — resolved by a CloudFormation dynamic reference.
    await ssm.send(
      new PutParameterCommand({
        Name: `${prefix}/origin-verify`,
        Value: originVerifySecret,
        Type: "String",
        Overwrite: true,
      }),
    );
    console.log("origin-verify set — redeploy the stack to apply");
  }

  if (!wants("jwt-signing-key") && !wants("mcp-client-secret-hash") && !wants("passkey-bootstrap-token")) {
    return;
  }

  const jwtSigningKey = randomBytes(48).toString("base64url"); // 64 chars, > 32 min
  const mcpSecret = `bio_mcp_${randomBytes(32).toString("base64url")}`;
  const bootstrapToken = randomBytes(24).toString("base64url");
  const mcpSecretHash = await hashSecret(mcpSecret);

  if (wants("jwt-signing-key")) await putSecure(ssm, `${prefix}/jwt-signing-key`, jwtSigningKey);
  if (wants("mcp-client-secret-hash")) await putSecure(ssm, `${prefix}/mcp-client-secret-hash`, mcpSecretHash);
  if (wants("passkey-bootstrap-token")) await putSecure(ssm, `${prefix}/passkey-bootstrap-token`, bootstrapToken);

  // Secrets the operator must save now — printed once, not stored in plaintext anywhere central.
  console.log(`\n✅ Provisioned auth secrets for ${env} (${prefix}/*)\n`);
  console.log("Save these now — they cannot be recovered:\n");
  if (wants("mcp-client-secret-hash")) console.log(`  MCP client secret (BIO_API_KEY):  ${mcpSecret}`);
  if (wants("passkey-bootstrap-token")) console.log(`  Passkey bootstrap token:          ${bootstrapToken}\n`);
  if (wants("jwt-signing-key")) console.log("The JWT signing key was stored server-side only (not printed).\n");
}

// Guard so importing this module (e.g. from a test) doesn't run main() against real AWS.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
