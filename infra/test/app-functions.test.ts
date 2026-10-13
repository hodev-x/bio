import { describe, it, expect } from "vitest";
import { appApiPrefixStripCode, appSpaFallbackCode } from "../lib/constructs/app-functions.js";
import { loadHandler, type CfRequest } from "./support/cloudfront-function.js";

describe("app API prefix strip", () => {
  const strip = loadHandler(appApiPrefixStripCode());
  const run = (request: CfRequest) => strip({ request }) as CfRequest;

  it("strips /apps/<name> and keeps the query string", () => {
    const out = run({ uri: "/apps/fluxor/api/x", querystring: { y: { value: "1" } } });
    expect(out.uri).toBe("/api/x");
    expect(out.querystring).toEqual({ y: { value: "1" } });
  });
  it("keeps nested API paths and the bare API root", () => {
    expect(run({ uri: "/apps/fluxor/api/accounts/12/transactions" }).uri).toBe("/api/accounts/12/transactions");
    expect(run({ uri: "/apps/my-app2/api/" }).uri).toBe("/api/");
  });
  it("leaves a URI it does not recognise unchanged", () => {
    expect(run({ uri: "/api/x" }).uri).toBe("/api/x");
    expect(run({ uri: "/apps/fluxor/x" }).uri).toBe("/apps/fluxor/x");
  });
});

describe("app SPA fallback", () => {
  const fallback = loadHandler(appSpaFallbackCode());
  const run = (uri: string) => (fallback({ request: { uri } }) as CfRequest).uri;

  it("serves the app shell for the app root and its client routes", () => {
    expect(run("/apps/fluxor/")).toBe("/apps/fluxor/index.html");
    expect(run("/apps/fluxor/accounts")).toBe("/apps/fluxor/index.html");
    expect(run("/apps/fluxor/accounts/12/")).toBe("/apps/fluxor/index.html");
  });
  it("leaves files alone", () => {
    expect(run("/apps/fluxor/assets/index-abc123.js")).toBe("/apps/fluxor/assets/index-abc123.js");
    expect(run("/apps/fluxor/sw.js")).toBe("/apps/fluxor/sw.js");
    expect(run("/apps/fluxor/manifest.webmanifest")).toBe("/apps/fluxor/manifest.webmanifest");
    expect(run("/apps/fluxor/index.html")).toBe("/apps/fluxor/index.html");
  });
});
