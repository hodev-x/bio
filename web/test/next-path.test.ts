import { describe, it, expect } from "vitest";
import { safeNext, isAppPath } from "../src/pages/admin/nextPath";

const origin = "https://staging.example.com";

describe("safeNext", () => {
  it.each([
    ["/admin/posts", "/admin/posts"],
    ["/apps/fluxor/", "/apps/fluxor/"],
    ["/apps/fluxor/accounts?tab=all#top", "/apps/fluxor/accounts?tab=all#top"],
    ["/blog", "/blog"],
  ])("allows the same-site path %j", (next, expected) => {
    expect(safeNext(next, origin)).toBe(expected);
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["protocol-relative", "//evil.com"],
    ["protocol-relative with path", "//evil.com/apps/fluxor/"],
    ["absolute other origin", "https://evil.com"],
    ["absolute same origin", "https://staging.example.com/admin"],
    ["backslash", "/\\evil.com"],
    ["tab stripped by the URL parser", "/\t/evil.com"],
    ["newline stripped by the URL parser", "/\n/evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["relative without a slash", "evil.com"],
    ["leading space", " /admin"],
  ])("rejects %s", (_label, next) => {
    expect(safeNext(next, origin)).toBeNull();
  });
});

describe("isAppPath", () => {
  it("is true only under /apps/", () => {
    expect(isAppPath("/apps/fluxor/")).toBe(true);
    expect(isAppPath("/apps")).toBe(false);
    expect(isAppPath("/admin")).toBe(false);
  });
});
