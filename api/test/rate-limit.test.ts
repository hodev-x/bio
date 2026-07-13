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

  it("keys the limiter on the rightmost X-Forwarded-For entry, resisting a spoofed leftmost", async () => {
    const app = await buildApp({ ...authDeps });
    // Same rightmost entry (the closest infra hop's IP) on every request, but a
    // different, attacker-controlled leftmost entry each time. If the limiter
    // keyed on req.ip (leftmost under trustProxy), each request would land in
    // a fresh bucket and never hit 429.
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/token",
        payload: { secret: "x" },
        headers: { "x-forwarded-for": `10.0.0.${i}, 198.51.100.7` },
      });
      expect(res.statusCode).toBe(401); // limited but not yet blocked
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/api/auth/token",
      payload: { secret: "x" },
      headers: { "x-forwarded-for": "10.0.0.99, 198.51.100.7" },
    });
    expect(blocked.statusCode).toBe(429);
  });
});
