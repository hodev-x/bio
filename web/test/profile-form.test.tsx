import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { ProfilePage } from "../src/pages/admin/ProfilePage";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => vi.restoreAllMocks());

const ui = () => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter><ProfilePage /></MemoryRouter>
  </QueryClientProvider>
);

describe("profile editor", () => {
  it("loads current profile into the form and PUTs edits", async () => {
    const puts: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "PUT") { puts.push(JSON.parse(String(init.body))); return json({ ok: true }); }
      if (url.startsWith("/api/content")) {
        return json({ profile: { id: "me", name: "Daniel", tagline: "SDE", visible: true }, experience: [], education: [], skills: [], projects: [] });
      }
      return json({ items: [] });
    });
    render(ui());
    const name = await screen.findByLabelText(/name/i);
    expect(name).toHaveValue("Daniel");
    await userEvent.clear(name);
    await userEvent.type(name, "Daniel Hodeta");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
    expect(puts[0]).toMatchObject({ name: "Daniel Hodeta", tagline: "SDE" });
  });

  it("shows zod validation errors before submitting", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).startsWith("/api/content")
        ? json({ profile: { id: "me", name: "D", tagline: "t", visible: true }, experience: [], education: [], skills: [], projects: [] })
        : json({ items: [] }));
    render(ui());
    const name = await screen.findByLabelText(/name/i);
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/string must contain at least 1/i)).toBeInTheDocument();
  });

  it("edits title, company, team and avatar URL", async () => {
    const puts: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (init?.method === "PUT") { puts.push(JSON.parse(String(init.body))); return json({ ok: true }); }
      if (String(input).startsWith("/api/content")) {
        return json({ profile: { id: "me", name: "Daniel", tagline: "SDE", visible: true }, experience: [], education: [], skills: [], projects: [] });
      }
      return json({ items: [] });
    });
    render(ui());
    await userEvent.type(await screen.findByLabelText("Title"), "Engineer");
    await userEvent.type(screen.getByLabelText("Company"), "Acme");
    await userEvent.type(screen.getByLabelText("Team"), "Platform");
    await userEvent.type(screen.getByLabelText("Avatar URL"), "https://example.com/a.png");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
    expect(puts[0]).toMatchObject({ title: "Engineer", company: "Acme", team: "Platform", avatarUrl: "https://example.com/a.png" });
  });
});
