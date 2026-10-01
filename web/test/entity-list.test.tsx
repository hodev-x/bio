import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { EntityListPage } from "../src/pages/admin/EntityListPage";
import { skillsConfig } from "../src/pages/admin/entityConfigs";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => vi.restoreAllMocks());

describe("entity list page (skills exemplar)", () => {
  it("lists items with hidden badges, edits into the form, toggles visibility", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push({ url: String(input), init });
      if (String(input).startsWith("/api/content")) {
        return json({ profile: null, experience: [], education: [], skills: [{ category: "languages", items: ["TS"], visible: false }], projects: [] });
      }
      return json({ ok: true });
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><EntityListPage config={skillsConfig} /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("languages")).toBeInTheDocument();
    expect(screen.getByText("hidden")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByLabelText(/items 1/i)).toHaveValue("TS");
    await userEvent.click(screen.getByRole("button", { name: /^show$/i }));
    const patch = calls.find((c) => c.init?.method === "PATCH");
    expect(patch?.url).toBe("/api/skills/languages");
    expect(JSON.parse(String(patch?.init?.body))).toEqual({ visible: true });
  });

  const renderSkills = (puts: string[]) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (init?.method === "PUT") { puts.push(String(init.body)); return json({ ok: true }); }
      if (String(input).startsWith("/api/content")) {
        return json({ profile: null, experience: [], education: [], skills: [], projects: [] });
      }
      return json({ ok: true });
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><EntityListPage config={skillsConfig} /></MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it("sends a numeric order and a label", async () => {
    const puts: string[] = [];
    renderSkills(puts);
    await userEvent.type(await screen.findByLabelText("category"), "langs");
    await userEvent.type(screen.getByLabelText("Label"), "Languages");
    const order = screen.getByLabelText("Order");
    expect(order).toHaveAttribute("type", "number");
    await userEvent.type(order, "2");
    await userEvent.click(screen.getByRole("button", { name: /\+ add/i }));
    await userEvent.type(screen.getByLabelText(/items 1/i), "TS");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await vi.waitFor(() => expect(puts).toHaveLength(1));
    const body = JSON.parse(puts[0]);
    expect(body.order).toBe(2);
    expect(body.label).toBe("Languages");
  });

  it("omits order when left empty", async () => {
    const puts: string[] = [];
    renderSkills(puts);
    await userEvent.type(await screen.findByLabelText("category"), "langs");
    await userEvent.click(screen.getByRole("button", { name: /\+ add/i }));
    await userEvent.type(screen.getByLabelText(/items 1/i), "TS");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await vi.waitFor(() => expect(puts).toHaveLength(1));
    expect(JSON.parse(puts[0])).not.toHaveProperty("order");
  });
});
