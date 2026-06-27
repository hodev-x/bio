import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (s: string, salt: string, len: number) => Promise<Buffer>;
const KEYLEN = 64;

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(secret, salt, KEYLEN);
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scryptAsync(secret, salt, expected.length || KEYLEN);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

// Human-friendly one-time recovery codes, e.g. "k7m2-q9xa-3rtp".
export function generateRecoveryCodes(n: number): string[] {
  const codes = new Set<string>();
  while (codes.size < n) {
    const raw = randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "");
    codes.add(`${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`);
  }
  return [...codes];
}
