import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";

const authDeps = {
  getAuthConfig: async () => ({
    jwtSigningKey: "test-signing-key-at-least-32-bytes-long-xxxxxx",
    mcpClientSecretHash: "salt:hash",
    passkeyBootstrapToken: "boot",
  }),
  verifyMcpSecret: async () => false,
};

describe("auth rate limiting", () => {
  it("returns 429 after 10 requests/min to an /api/auth route from one IP", async () => {
    const app = await buildApp({ ...authDeps });
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({ method: "POST", url: "/api/auth/token", payload: { secret: "x" } });
      expect(res.statusCode).toBe(401); // limited but not yet blocked
    }
    const blocked = await app.inject({ method: "POST", url: "/api/auth/token", payload: { secret: "x" } });
    expect(blocked.statusCode).toBe(429);
  });

  it("does not limit non-auth routes", async () => {
    const app = await buildApp({ ...authDeps });
    for (let i = 0; i < 15; i++) {
      const res = await app.inject({ method: "GET", url: "/api/health" });
      expect(res.statusCode).toBe(200);
    }
  });

  it("keys on the CloudFront-appended viewer IP: spoofed leftmost and rotating CF egress share one bucket", async () => {
    const app = await buildApp({ ...authDeps });
    // Via-CloudFront shape: [attacker junk, viewer (appended by CloudFront),
    // CF egress (appended by API GW)]. The junk AND the egress vary per
    // request; only the viewer entry is stable. Keying on req.ip (leftmost)
    // or on the rightmost entry would give every request a fresh bucket and
    // never 429 — the latter is exactly what staging demonstrated.
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/token",
        payload: { secret: "x" },
        headers: { "x-forwarded-for": `10.0.0.${i}, 203.0.113.9, 64.252.100.${i}` },
      });
      expect(res.statusCode).toBe(401); // limited but not yet blocked
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/api/auth/token",
      payload: { secret: "x" },
      headers: { "x-forwarded-for": "10.0.0.99, 203.0.113.9, 64.252.100.99" },
    });
    expect(blocked.statusCode).toBe(429);
  });

  it("falls back to the sole X-Forwarded-For entry when only one is present (direct API GW path)", async () => {
    const app = await buildApp({ ...authDeps });
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/token",
        payload: { secret: "x" },
        headers: { "x-forwarded-for": "198.51.100.7" },
      });
      expect(res.statusCode).toBe(401);
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/api/auth/token",
      payload: { secret: "x" },
      headers: { "x-forwarded-for": "198.51.100.7" },
    });
    expect(blocked.statusCode).toBe(429);
  });
});
