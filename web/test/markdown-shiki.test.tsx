import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Markdown } from "../src/components/Markdown";
import { getRehypeShiki, _resetHighlighterForTests } from "../src/markdown/highlighter";

// Lets a single test force one rejection from createHighlighterCore while every
// other test (and every other call) goes through the real implementation.
let forceRejectOnce = false;

vi.mock("@shikijs/core", async () => {
  const actual = await vi.importActual<typeof import("@shikijs/core")>("@shikijs/core");
  const createHighlighterCore: typeof actual.createHighlighterCore = (options) => {
    if (forceRejectOnce) {
      forceRejectOnce = false;
      return Promise.reject(new Error("chunk load failed"));
    }
    return actual.createHighlighterCore(options);
  };
  return { ...actual, createHighlighterCore };
});

describe("Markdown + Shiki", () => {
  it("highlights a fenced ts block (spans with shiki styles) after the lazy load", async () => {
    const { container } = render(<Markdown source={"```ts\nconst x: number = 1;\n```"} />);
    expect(screen.getByText(/const x/)).toBeInTheDocument(); // sanitized fallback renders immediately
    await waitFor(() => expect(container.querySelector("pre.shiki")).not.toBeNull(), { timeout: 10_000 });
    expect(container.querySelectorAll("pre.shiki span[style]").length).toBeGreaterThan(1);
  });
  it("falls back to plaintext for an unknown language", async () => {
    const { container } = render(<Markdown source={"```brainfuck\n+++\n```"} />);
    await waitFor(() => expect(container.querySelector("pre.shiki")).not.toBeNull(), { timeout: 10_000 });
    expect(container.textContent).toContain("+++");
  });
  it("still strips raw HTML (sanitize runs before shiki)", async () => {
    const { container } = render(<Markdown source={"<script>alert(1)</script>\n\n**ok**"} />);
    await waitFor(() => expect(screen.getByText("ok")).toBeInTheDocument());
    expect(container.querySelector("script")).toBeNull();
  });
  it("retries on the next call instead of caching a rejected load forever", async () => {
    _resetHighlighterForTests();
    forceRejectOnce = true;
    await expect(getRehypeShiki()).rejects.toThrow("chunk load failed");
    await expect(getRehypeShiki()).resolves.toBeDefined();
  });
});
