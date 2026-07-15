import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";

describe("error handler", () => {
  it("masks unhandled errors as a generic 500", async () => {
    const app = await buildApp({ getSiteContent: async () => { throw new Error("secret table arn leaked"); } });
    const res = await app.inject({ method: "GET", url: "/api/content" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "internal error" });
    expect(res.body).not.toContain("secret");
  });

  it("keeps 4xx statuses from the framework (bad JSON body)", async () => {
    const app = await buildApp({});
    const res = await app.inject({
      method: "POST", url: "/api/auth/token",
      headers: { "content-type": "application/json" }, payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
  });
});
