import { describe, it, expect } from "vitest";
import { buildApp, type AppDeps } from "../src/app.js";
import { signAccessToken } from "../src/auth/jwt.js";

const KEY = "test-signing-key-at-least-32-bytes-long-xxxxxx";
const baseDeps = {
  getAuthConfig: async () => ({ jwtSigningKey: KEY, mcpClientSecretHash: "salt:hash", passkeyBootstrapToken: "boot" }),
};
const bearer = async () => ({ authorization: `Bearer ${await signAccessToken(KEY, { sub: "admin" })}` });

describe("posts write routes", () => {
  it("POST /api/posts creates and returns 201 with defaults applied", async () => {
    let saved: Record<string, unknown> | undefined;
    const deps: AppDeps = { ...baseDeps, createPost: async (item) => { saved = item; return true; } };
    const app = await buildApp(deps);
    const res = await app.inject({
      method: "POST", url: "/api/posts", headers: await bearer(),
      payload: { slug: "hello-world", title: "Hello", body: "# hi" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ slug: "hello-world", tags: [], visible: true });
    expect(typeof res.json().publishedAt).toBe("string");
    expect(saved).toMatchObject({ slug: "hello-world" });
  });

  it("POST /api/posts returns 409 on duplicate slug", async () => {
    const deps: AppDeps = { ...baseDeps, createPost: async () => false };
    const app = await buildApp(deps);
    const res = await app.inject({
      method: "POST", url: "/api/posts", headers: await bearer(),
      payload: { slug: "dupe", title: "t", body: "b" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("POST /api/posts rejects an invalid body with 400 and requires auth", async () => {
    const deps: AppDeps = { ...baseDeps, createPost: async () => true };
    const app = await buildApp(deps);
    const bad = await app.inject({ method: "POST", url: "/api/posts", headers: await bearer(), payload: { slug: "Bad Slug", title: "t", body: "b" } });
    expect(bad.statusCode).toBe(400);
    const noAuth = await app.inject({ method: "POST", url: "/api/posts", payload: { slug: "x", title: "t", body: "b" } });
    expect(noAuth.statusCode).toBe(401);
  });

  it("PUT /api/posts/:slug upserts with the URL slug winning", async () => {
    const puts: unknown[] = [];
    const deps: AppDeps = { ...baseDeps, putEntity: async (type, item) => { puts.push([type, item]); } };
    const app = await buildApp(deps);
    const res = await app.inject({
      method: "PUT", url: "/api/posts/hello-world", headers: await bearer(),
      payload: { slug: "spoofed", title: "Hello v2", body: "updated" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().slug).toBe("hello-world");
    expect(puts[0]).toMatchObject(["posts", { slug: "hello-world", title: "Hello v2" }]);
  });

  it("DELETE /api/posts/:slug returns 204", async () => {
    const dels: unknown[] = [];
    const deps: AppDeps = { ...baseDeps, deleteEntity: async (type, key) => { dels.push([type, key]); } };
    const app = await buildApp(deps);
    const res = await app.inject({ method: "DELETE", url: "/api/posts/hello-world", headers: await bearer() });
    expect(res.statusCode).toBe(204);
    expect(dels[0]).toEqual(["posts", "hello-world"]);
  });
});
