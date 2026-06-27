import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

// Table names from env (set by Lambda environment / CDK).
const CREDS_TABLE = () => process.env.TABLE_CREDENTIALS ?? "bio-credentials";
const CHALLENGES_TABLE = () => process.env.TABLE_AUTH_CHALLENGES ?? "bio-auth-challenges";

// ── Credentials ──────────────────────────────────────────────────────────────

export interface Credential {
  id: string;
  type: "passkey" | "recovery";
  publicKey?: string;
  counter?: number;
  transports?: string[];
  hash?: string;       // recovery: scrypt hash of the code
  used?: boolean;      // recovery: true once consumed
}

export async function saveCredential(
  ddb: DynamoDBDocumentClient,
  item: Credential,
): Promise<void> {
  await ddb.send(new PutCommand({ TableName: CREDS_TABLE(), Item: item }));
}

export async function getCredential(
  ddb: DynamoDBDocumentClient,
  id: string,
): Promise<Credential | null> {
  const out = await ddb.send(new GetCommand({ TableName: CREDS_TABLE(), Key: { id } }));
  return (out.Item as Credential) ?? null;
}

export async function listCredentials(ddb: DynamoDBDocumentClient): Promise<Credential[]> {
  const out = await ddb.send(new ScanCommand({ TableName: CREDS_TABLE() }));
  return (out.Items ?? []) as Credential[];
}

export async function countCredentials(ddb: DynamoDBDocumentClient): Promise<number> {
  const all = await listCredentials(ddb);
  return all.filter((c) => c.type === "passkey").length;
}

// ── Recovery codes ────────────────────────────────────────────────────────────

/**
 * Store hashed recovery codes.  Each is stored as an item with
 * id = "recovery#<first-8-chars-of-hash>" to keep the key short and unique.
 */
export async function saveRecoveryCodes(
  ddb: DynamoDBDocumentClient,
  hashes: string[],
): Promise<void> {
  await Promise.all(
    hashes.map((hash) =>
      ddb.send(
        new PutCommand({
          TableName: CREDS_TABLE(),
          Item: { id: `recovery#${hash.slice(0, 8)}`, type: "recovery", hash, used: false },
        }),
      ),
    ),
  );
}

/**
 * Verify a plaintext recovery code against stored hashes.
 * On a match, marks the item as used (cannot be reused).
 * Returns true if a valid unused code was consumed, false otherwise.
 */
export async function consumeRecoveryCode(
  ddb: DynamoDBDocumentClient,
  code: string,
): Promise<boolean> {
  // Scan for recovery items and verify via the hash.
  const { verifySecret } = await import("../auth/hash.js");
  const out = await ddb.send(new ScanCommand({ TableName: CREDS_TABLE() }));
  const items = (out.Items ?? []) as Credential[];
  for (const item of items) {
    if (item.type !== "recovery" || item.used || !item.hash) continue;
    if (await verifySecret(code, item.hash)) {
      // Mark as used.
      await ddb.send(
        new PutCommand({
          TableName: CREDS_TABLE(),
          Item: { ...item, used: true },
        }),
      );
      return true;
    }
  }
  return false;
}

// ── Challenges ────────────────────────────────────────────────────────────────

/**
 * Save a WebAuthn challenge with a TTL.
 * DynamoDB TTL is epoch-seconds; items with ttl < now are automatically removed.
 */
export async function saveChallenge(
  ddb: DynamoDBDocumentClient,
  id: string,
  challenge: string,
  ttlSeconds: number,
): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + ttlSeconds;
  await ddb.send(
    new PutCommand({
      TableName: CHALLENGES_TABLE(),
      Item: { id, challenge, ttl },
    }),
  );
}

/**
 * Retrieve and immediately delete a challenge (single-use).
 * Returns the challenge string, or null if not found.
 */
export async function consumeChallenge(
  ddb: DynamoDBDocumentClient,
  id: string,
): Promise<string | null> {
  const out = await ddb.send(new GetCommand({ TableName: CHALLENGES_TABLE(), Key: { id } }));
  const item = out.Item as { id: string; challenge: string; ttl: number } | undefined;
  if (!item) return null;
  await ddb.send(new DeleteCommand({ TableName: CHALLENGES_TABLE(), Key: { id } }));
  return item.challenge;
}
