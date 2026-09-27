import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router";
import { ModeProvider } from "../src/mode/ModeContext";
import { PostPage } from "../src/pages/public/PostPage";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(() => vi.restoreAllMocks());
const ui = (slug: string) => render(<QueryClientProvider client={new QueryClient()}><ModeProvider><MemoryRouter initialEntries={[`/blog/${slug}`]}><Routes><Route path="/blog/:slug" element={<PostPage />} /></Routes></MemoryRouter></ModeProvider></QueryClientProvider>);

describe("PostPage", () => {
  it("renders markdown and sets the title", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ slug: "hello", title: "Hello", body: "# Heading\n\nText **bold**", publishedAt: "2026-01-01T00:00:00.000Z", tags: [] }));
    ui("hello");
    expect(await screen.findByRole("heading", { level: 1, name: "Hello" })).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Hello — Daniel Hodeta"));
  });
  it("shows the 404 UI for an unknown slug", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: "not found" }, 404));
    ui("nope");
    expect(await screen.findByRole("heading", { name: /not found/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/");
  });
});
