import { describe, it, expect, afterEach } from "vitest";
import { flag } from "../scripts/provision-secrets.js";

const originalArgv = process.argv;

describe("provision-secrets --only parsing", () => {
  afterEach(() => {
    process.argv = originalArgv;
  });

  it("returns the value when --only is given a value", () => {
    process.argv = ["node", "provision-secrets.ts", "--only", "origin-verify"];
    expect(flag("only")).toBe("origin-verify");
  });

  it("returns undefined when --only is absent", () => {
    process.argv = ["node", "provision-secrets.ts", "--env", "staging"];
    expect(flag("only")).toBeUndefined();
  });

  it("throws when --only is the last argument (no value)", () => {
    process.argv = ["node", "provision-secrets.ts", "--env", "staging", "--only"];
    expect(() => flag("only")).toThrow(/--only requires a value/);
  });

  it("throws when --only is immediately followed by another flag", () => {
    process.argv = ["node", "provision-secrets.ts", "--only", "--env", "staging"];
    expect(() => flag("only")).toThrow(/--only requires a value/);
  });
});
