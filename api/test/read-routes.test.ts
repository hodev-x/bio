import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";

const deps = {
  getSiteContent: async () => ({ profile: { name: "Daniel" }, experience: [], education: [], skills: [], projects: [] }),
  listPosts: async () => ({ items: [{ slug: "hello", title: "Hello" }], cursor: null }),
  getPost: async (slug: string) => (slug === "hello" ? { slug, title: "Hello" } : null),
};

describe("read routes", () => {
  it("GET /api/content returns aggregated content", async () => {
    const res = await buildApp(deps).inject({ method: "GET", url: "/api/content" });
    expect(res.statusCode).toBe(200);
    expect(res.json().profile.name).toBe("Daniel");
  });

  it("GET /api/posts returns a list", async () => {
    const res = await buildApp(deps).inject({ method: "GET", url: "/api/posts" });
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].slug).toBe("hello");
  });

  it("GET /api/posts/:slug returns one post", async () => {
    const res = await buildApp(deps).inject({ method: "GET", url: "/api/posts/hello" });
    expect(res.statusCode).toBe(200);
    expect(res.json().slug).toBe("hello");
  });

  it("GET /api/posts/:slug returns 404 for missing", async () => {
    const res = await buildApp(deps).inject({ method: "GET", url: "/api/posts/nope" });
    expect(res.statusCode).toBe(404);
  });

  it("public GET /api/content does NOT include hidden items (no includeHidden)", async () => {
    let calledWith: unknown;
    const res = await buildApp({
      ...deps,
      getSiteContent: async (opts?: { includeHidden?: boolean }) => {
        calledWith = opts;
        return { profile: null, experience: [], education: [], skills: [], projects: [] };
      },
    }).inject({ method: "GET", url: "/api/content" });
    expect(res.statusCode).toBe(200);
    expect(calledWith).toBeUndefined(); // route calls with no includeHidden on the public path
  });
});
