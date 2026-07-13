import { describe, it, expect } from "vitest";
import { buildApp, type AppDeps } from "../src/app.js";
import { signAccessToken } from "../src/auth/jwt.js";
import type { EntityType } from "@bio/shared";

const KEY = "test-signing-key-at-least-32-bytes-long-xxxxxx";
const baseDeps = {
  getAuthConfig: async () => ({ jwtSigningKey: KEY, mcpClientSecretHash: "salt:hash", passkeyBootstrapToken: "boot" }),
};
const bearer = async () => ({ authorization: `Bearer ${await signAccessToken(KEY, { sub: "admin" })}` });

function capture() {
  const calls: { put: unknown[]; del: unknown[]; patch: unknown[] } = { put: [], del: [], patch: [] };
  const deps: AppDeps = {
    ...baseDeps,
    putEntity: async (type: EntityType, item: Record<string, unknown>) => { calls.put.push([type, item]); },
    deleteEntity: async (type: EntityType, key: string) => { calls.del.push([type, key]); },
    patchVisible: async (_type: EntityType, key: string) => key !== "ghost",
  };
  return { calls, deps };
}

describe("entity write routes", () => {
  it("rejects writes without a token", async () => {
    const { deps } = capture();
    const app = await buildApp(deps);
    expect((await app.inject({ method: "PUT", url: "/api/profile", payload: { name: "D", tagline: "t" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "DELETE", url: "/api/projects/x" })).statusCode).toBe(401);
    expect((await app.inject({ method: "PATCH", url: "/api/posts/x", payload: { visible: false } })).statusCode).toBe(401);
  });

  it("PUT /api/profile validates, forces id=me, and upserts", async () => {
    const { calls, deps } = capture();
    const res = await (await buildApp(deps)).inject({
      method: "PUT", url: "/api/profile", headers: await bearer(),
      payload: { name: "Daniel", tagline: "SDE" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: "me", name: "Daniel", visible: true });
    expect(calls.put[0]).toMatchObject(["profile", { id: "me", name: "Daniel" }]);
  });

  it("PUT /api/experience/:key takes the key from the URL (body key ignored)", async () => {
    const { calls, deps } = capture();
    const res = await (await buildApp(deps)).inject({
      method: "PUT", url: "/api/experience/amazon-sde", headers: await bearer(),
      payload: { id: "spoofed", role: "SDE", company: "Amazon", startDate: "2024-01" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe("amazon-sde");
    expect(calls.put[0]).toMatchObject(["experience", { id: "amazon-sde" }]);
  });

  it("PUT with an invalid body returns 400 with field errors", async () => {
    const { deps } = capture();
    const res = await (await buildApp(deps)).inject({
      method: "PUT", url: "/api/skills/languages", headers: await bearer(),
      payload: { items: [123] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation failed");
    expect(res.json().issues).toBeTruthy();
  });

  it("DELETE /api/education/:key is idempotent 204", async () => {
    const { calls, deps } = capture();
    const res = await (await buildApp(deps)).inject({ method: "DELETE", url: "/api/education/mit", headers: await bearer() });
    expect(res.statusCode).toBe(204);
    expect(calls.del[0]).toEqual(["education", "mit"]);
  });

  it("PATCH /api/:type/:key toggles visibility; 404 for missing item or unknown type", async () => {
    const { deps } = capture();
    const app = await buildApp(deps);
    const ok = await app.inject({ method: "PATCH", url: "/api/projects/money-lens", headers: await bearer(), payload: { visible: false } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ id: "money-lens", visible: false });
    expect((await app.inject({ method: "PATCH", url: "/api/projects/ghost", headers: await bearer(), payload: { visible: false } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: "/api/wat/x", headers: await bearer(), payload: { visible: false } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: "/api/projects/x", headers: await bearer(), payload: { visible: "no" } })).statusCode).toBe(400);
  });
});
