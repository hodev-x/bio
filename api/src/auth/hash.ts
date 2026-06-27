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
// Fixed 36-char alphabet so every code is exactly 12 chars (~62 bits) — no truncated/empty
// segments (a base64url-strip approach produced malformed short codes ~31% of the time).
const RECOVERY_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export function generateRecoveryCodes(n: number): string[] {
  const codes = new Set<string>();
  while (codes.size < n) {
    const chars = Array.from(randomBytes(12), (b) => RECOVERY_ALPHABET[b % 36]).join("");
    codes.add(`${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`);
  }
  return [...codes];
}
