import { describe, it, expect } from "vitest";
import { signAccessToken, signRefreshToken, verifyToken } from "../src/auth/jwt.js";

const key = "test-signing-key-at-least-32-bytes-long-xxxxxx";

describe("jwt", () => {
  it("signs and verifies an access token with the principal", async () => {
    const tok = await signAccessToken(key, { sub: "admin" });
    const claims = await verifyToken(key, tok);
    expect(claims.sub).toBe("admin");
    expect(claims.typ).toBe("access");
  });

  it("rejects a token signed with a different key", async () => {
    const tok = await signAccessToken(key, { sub: "admin" });
    await expect(verifyToken("another-key-that-is-also-32-bytes-long-yyyy", tok)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const tok = await signAccessToken(key, { sub: "admin" }, "0s");
    await new Promise((r) => setTimeout(r, 1100));
    await expect(verifyToken(key, tok)).rejects.toThrow();
  });

  it("distinguishes access vs refresh tokens", async () => {
    const r = await signRefreshToken(key, { sub: "admin" });
    const claims = await verifyToken(key, r);
    expect(claims.typ).toBe("refresh");
  });
});
