import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";

const deps = { getSiteContent: async () => ({ profile: null, experience: [], education: [], skills: [], projects: [] }) };

describe("origin verify", () => {
  it("is skipped when no secret is configured", async () => {
    const res = await (await buildApp({ ...deps, originVerifySecret: undefined })).inject({ url: "/api/health" });
    expect(res.statusCode).toBe(200);
  });
  it("403s a missing or wrong header", async () => {
    const app = await buildApp({ ...deps, originVerifySecret: "s3cret" });
    expect((await app.inject({ url: "/api/health" })).statusCode).toBe(403);
    const wrong = await app.inject({ url: "/api/health", headers: { "x-origin-verify": "nope" } });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json()).toEqual({ error: "forbidden" });
  });
  it("403s a same-length mismatch (exercises timingSafeEqual, not just the length check)", async () => {
    const app = await buildApp({ ...deps, originVerifySecret: "s3cret" });
    const res = await app.inject({ url: "/api/health", headers: { "x-origin-verify": "s3crez" } });
    expect(res.statusCode).toBe(403);
  });
  it("passes a matching header, on every route incl. /api/content", async () => {
    const app = await buildApp({ ...deps, originVerifySecret: "s3cret" });
    expect((await app.inject({ url: "/api/content", headers: { "x-origin-verify": "s3cret" } })).statusCode).toBe(200);
  });
});
