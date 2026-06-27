import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { signAccessToken } from "../src/auth/jwt.js";

const KEY = "test-signing-key-at-least-32-bytes-long-xxxxxx";
const authDeps = {
  getAuthConfig: async () => ({ jwtSigningKey: KEY, mcpClientSecretHash: "salt:hash", passkeyBootstrapToken: "boot" }),
  verifyMcpSecret: async (secret: string) => secret === "good-secret",
};

describe("auth routes", () => {
  it("POST /api/auth/token issues a JWT for a valid MCP secret", async () => {
    const res = await buildApp({ ...authDeps }).inject({
      method: "POST", url: "/api/auth/token", payload: { secret: "good-secret" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeTruthy();
  });

  it("POST /api/auth/token rejects a bad secret", async () => {
    const res = await buildApp({ ...authDeps }).inject({
      method: "POST", url: "/api/auth/token", payload: { secret: "nope" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/auth/me requires a valid bearer token", async () => {
    const app = buildApp({ ...authDeps });
    expect((await app.inject({ method: "GET", url: "/api/auth/me" })).statusCode).toBe(401);
    const token = await signAccessToken(KEY, { sub: "mcp" });
    const ok = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().sub).toBe("mcp");
  });

  it("GET /api/content?includeHidden=true requires auth; public omits hidden", async () => {
    let sawIncludeHidden: boolean | undefined;
    const app = buildApp({
      ...authDeps,
      getSiteContent: async (opts?: { includeHidden?: boolean }) => { sawIncludeHidden = opts?.includeHidden; return { profile: null, experience: [], education: [], skills: [], projects: [] }; },
    });
    // public path: no auth, no includeHidden honored
    await app.inject({ method: "GET", url: "/api/content?includeHidden=true" });
    expect(sawIncludeHidden).toBeFalsy();
    // authed path: includeHidden honored
    const token = await signAccessToken(KEY, { sub: "admin" });
    await app.inject({ method: "GET", url: "/api/content?includeHidden=true", headers: { authorization: `Bearer ${token}` } });
    expect(sawIncludeHidden).toBe(true);
  });
});
