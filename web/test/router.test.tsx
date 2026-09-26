import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRoutes } from "../src/router";
import { AuthProvider } from "../src/hooks/useAuth";
import { ModeProvider } from "../src/mode/ModeContext";
import { setAccessToken } from "../src/api/client";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const content = { profile: { id: "me", name: "Daniel Hodeta", tagline: "Builder", about: "Hi.", socials: {}, visible: true }, experience: [], education: [], skills: [], projects: [] };
const posts = { items: [], cursor: null };

beforeEach(() => { setAccessToken(null); vi.restoreAllMocks(); });

describe("router", () => {
  it("serves the public Home at /", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => (String(u).startsWith("/api/posts") ? json(200, posts) : json(200, content)));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ModeProvider>
          <MemoryRouter initialEntries={["/"]}><AppRoutes /></MemoryRouter>
        </ModeProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Daniel Hodeta" })).toBeInTheDocument();
  });

  it("renders Not found for an unknown route", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => (String(u).startsWith("/api/posts") ? json(200, posts) : json(200, content)));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ModeProvider>
          <MemoryRouter initialEntries={["/nope"]}><AppRoutes /></MemoryRouter>
        </ModeProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });

  it("has an /admin/login route", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(401, {})); // mount refresh fails → anon
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/admin/login"]}><AppRoutes /></MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/login/i)).toBeInTheDocument();
  });
});
