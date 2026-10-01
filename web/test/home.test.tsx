import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { ModeProvider } from "../src/mode/ModeContext";
import { Home } from "../src/pages/public/Home";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const content = {
  profile: { id: "me", name: "Daniel Hodeta", title: "SDE II", company: "Acme", team: "Infra", avatarUrl: "https://example.com/a.png", tech: { about: ["profile-tech"] }, tagline: "Builder of small useful things", about: "Hi.", socials: { github: "https://github.com/hodev-x" }, visible: true },
  experience: [{ id: "acme", role: "Engineer", company: "Acme", team: "Platform", description: "Built the thing.", startDate: "2021", endDate: "2024", highlights: ["Shipped X"], tech: { stack: ["ts"] }, visible: true }],
  education: [{ id: "u", institution: "Uni", degree: "BS", startDate: "2018", endDate: "2022", highlights: ["Research assistant"], visible: true }],
  skills: [{ category: "languages", items: ["TypeScript", "Python"], visible: true }, { category: "frameworks-and-tools", label: "Frameworks & Tools", items: ["CDK"] }],
  projects: [{ id: "fluxor", title: "Fluxor", desc: "Cash-flow planning", status: "active", repo: "https://github.com/hodev-x/fluxor", visible: true }],
};
const posts = { items: [{ slug: "hello", title: "Hello", publishedAt: "2026-01-01T00:00:00.000Z" }], cursor: null };
const ui = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ModeProvider><MemoryRouter><Home /></MemoryRouter></ModeProvider></QueryClientProvider>);
beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("Home", () => {
  it("renders every populated section and skips empty ones", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => (String(u).startsWith("/api/posts") ? json(posts) : json(content)));
    const { container } = ui();
    expect(await screen.findByRole("heading", { level: 1, name: "Daniel Hodeta" })).toBeInTheDocument();
    expect(screen.getByText("Builder of small useful things")).toBeInTheDocument();
    expect(screen.getByText("Engineer")).toBeInTheDocument();
    expect(screen.getByText(/2021 – 2024/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fluxor" })).toHaveAttribute("href", "https://github.com/hodev-x/fluxor");
    expect(screen.getByText("TypeScript, Python")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Hello" })).toHaveAttribute("href", "/blog/hello");
    expect(screen.getByText("SDE II · Acme (Infra)")).toBeInTheDocument();
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://example.com/a.png");
    expect(img).toHaveAttribute("alt", "");
    expect(screen.getByText("Built the thing.")).toBeInTheDocument();
    expect(screen.getByText("Engineer").parentElement).toHaveTextContent(/Acme · Platform/);
    expect(screen.getByText("Research assistant")).toBeInTheDocument();
    expect(screen.getByText("Frameworks & Tools")).toBeInTheDocument();
    expect(screen.queryByText("frameworks-and-tools")).toBeNull();
    expect(screen.queryByText("profile-tech")).toBeNull();
  });
  it("omits the subtitle and avatar when the profile lacks those fields", async () => {
    const bare = { ...content, profile: { id: "me", name: "Daniel Hodeta", tagline: "Builder of small useful things", about: "Hi.", socials: {}, visible: true } };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => (String(u).startsWith("/api/posts") ? json(posts) : json(bare)));
    const { container } = ui();
    await screen.findByRole("heading", { level: 1, name: "Daniel Hodeta" });
    expect(container.querySelector(".subtitle")).toBeNull();
    expect(container.querySelector(".hero img")).toBeNull();
  });
  it("hides tech until dev mode is on", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => (String(u).startsWith("/api/posts") ? json(posts) : json(content)));
    ui();
    await screen.findByText("Engineer");
    expect(screen.queryByText(/stack/)).toBeNull();
  });
  it("shows a retry on fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: "boom" }, 500));
    ui();
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
