import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { Dashboard } from "../src/pages/admin/Dashboard";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => vi.restoreAllMocks());

describe("dashboard", () => {
  it("shows per-section counts with hidden indicators", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/content")) {
        return json({ profile: { id: "me", visible: true }, experience: [{ id: "a", visible: false }], education: [], skills: [], projects: [] });
      }
      return json({ items: [{ slug: "p1", visible: true }] });
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><Dashboard /></MemoryRouter>
      </QueryClientProvider>,
    );
    const exp = await screen.findByTestId("card-experience");
    expect(exp).toHaveTextContent("1 item");
    expect(exp).toHaveTextContent("1 hidden");
    expect(await screen.findByTestId("card-posts")).toHaveTextContent("1 item");
  });
});
