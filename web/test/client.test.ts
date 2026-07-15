import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError, setAccessToken, getAccessToken, refreshSession, subOf } from "../src/api/client";

const jwt = (sub: string) => `x.${btoa(JSON.stringify({ sub, typ: "access" }))}.y`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => { setAccessToken(null); vi.restoreAllMocks(); });

describe("api client", () => {
  it("attaches the bearer token on auth requests", async () => {
    setAccessToken("tok-1");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { ok: true }));
    await api("/api/auth/me", { auth: true });
    const headers = new Headers((spy.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer tok-1");
  });

  it("on 401 refreshes once, stores the new token, and retries", async () => {
    setAccessToken("stale");
    const spy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(401, { error: "unauthorized" }))
      .mockResolvedValueOnce(json(200, { accessToken: jwt("admin"), expiresIn: 900 }))
      .mockResolvedValueOnce(json(200, { sub: "admin" }));
    const out = await api<{ sub: string }>("/api/auth/me", { auth: true });
    expect(out.sub).toBe("admin");
    expect(spy).toHaveBeenCalledTimes(3);
    expect((spy.mock.calls[1][0] as string)).toBe("/api/auth/refresh");
    expect(getAccessToken()).toBe(jwt("admin"));
  });

  it("clears the token and throws 401 when refresh fails", async () => {
    setAccessToken("stale");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(401, { error: "unauthorized" }))
      .mockResolvedValueOnce(json(401, { error: "unauthorized" }));
    await expect(api("/api/auth/me", { auth: true })).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBeNull();
  });

  it("surfaces 400 field issues on ApiError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(400, { error: "validation failed", issues: { title: ["Required"] } }));
    const err = (await api("/api/posts", { method: "POST", body: {}, auth: true }).catch((e) => e as ApiError)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.issues?.title).toEqual(["Required"]);
  });

  it("refreshSession returns the sub on success and null on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(200, { accessToken: jwt("admin"), expiresIn: 900 }));
    expect(await refreshSession()).toEqual({ sub: "admin" });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(401, {}));
    expect(await refreshSession()).toBeNull();
  });

  it("subOf decodes base64url payloads containing - and _ characters", () => {
    // Standard-base64 encoding of {"sub":"sub->>>/??"} is
    // "eyJzdWIiOiJzdWItPj4+Lz8/In0=", which contains both "+" and "/"; the
    // base64url variant below swaps those for "-" and "_" respectively.
    const token = "x.eyJzdWIiOiJzdWItPj4-Lz8_In0=.y";
    expect(subOf(token)).toBe("sub->>>/??");
  });
});
