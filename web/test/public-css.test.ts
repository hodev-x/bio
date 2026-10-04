import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "src/styles/public.css"), "utf8");

describe("public.css timeline", () => {
  it("lays out only direct timeline rows as a grid, not nested highlight items", () => {
    // A descendant selector would also turn each highlight <li> into a
    // two-column grid, squeezing its text into the date column.
    expect(css).not.toMatch(/\.timeline li\b/);
    expect(css).toMatch(/\.public \.timeline > li \{[^}]*display: grid/);
  });
});
