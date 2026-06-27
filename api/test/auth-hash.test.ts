import { describe, it, expect } from "vitest";
import { hashSecret, verifySecret, generateRecoveryCodes } from "../src/auth/hash.js";

describe("hash", () => {
  it("hashes and verifies a secret; rejects a wrong one", async () => {
    const h = await hashSecret("bio_mcp_supersecret");
    expect(h).toContain(":"); // salt:hash format
    expect(await verifySecret("bio_mcp_supersecret", h)).toBe(true);
    expect(await verifySecret("wrong", h)).toBe(false);
  });

  it("verifySecret returns false for malformed stored value (no throw)", async () => {
    expect(await verifySecret("x", "not-a-valid-hash")).toBe(false);
  });

  it("generates N unique, well-formed recovery codes (always 12 chars)", () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    // every code is exactly xxxx-xxxx-xxxx (no truncated/empty segments)
    for (const c of codes) {
      expect(c).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
    }
  });
});
