import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router";
import { ModeProvider } from "../src/mode/ModeContext";
import { BlogList } from "../src/pages/public/BlogList";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(() => vi.restoreAllMocks());
const ui = () => render(<QueryClientProvider client={new QueryClient()}><ModeProvider><MemoryRouter initialEntries={["/blog"]}><Routes><Route path="/blog" element={<BlogList />} /></Routes></MemoryRouter></ModeProvider></QueryClientProvider>);

describe("BlogList", () => {
  it("lists posts and loads more via the cursor", async () => {
    const spy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ items: [{ slug: "two", title: "Two", publishedAt: "2026-02-01T00:00:00.000Z", tags: ["aws"] }], cursor: "C1" }))
      .mockResolvedValueOnce(json({ items: [{ slug: "one", title: "One", publishedAt: "2026-01-01T00:00:00.000Z", tags: [] }], cursor: null }));
    ui();
    expect(await screen.findByRole("link", { name: "Two" })).toHaveAttribute("href", "/blog/two");
    expect(screen.getByText("aws")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(await screen.findByRole("link", { name: "One" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
    expect(String(spy.mock.calls[1][0])).toContain("cursor=C1");
  });
});
