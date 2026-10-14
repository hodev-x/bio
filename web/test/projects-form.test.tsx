import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { EntityListPage } from "../src/pages/admin/EntityListPage";
import { projectsConfig } from "../src/pages/admin/entityConfigs";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const fluxor = { id: "fluxor", title: "Fluxor", desc: "Cash-flow planning", status: "active", visible: true, appPath: "/apps/fluxor/" };

const renderProjects = (puts: { url: string; body: Record<string, unknown> }[]) => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (init?.method === "PUT") { puts.push({ url: String(input), body: JSON.parse(String(init.body)) }); return json({ ok: true }); }
    if (String(input).startsWith("/api/content")) {
      return json({ profile: null, experience: [], education: [], skills: [], projects: [fluxor] });
    }
    return json({ ok: true });
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><EntityListPage config={projectsConfig} /></MemoryRouter>
    </QueryClientProvider>,
  );
};

const editFluxor = async () => {
  await screen.findByText("Fluxor");
  await userEvent.click(screen.getByRole("button", { name: /edit/i }));
  return screen.getByLabelText("App path");
};

beforeEach(() => vi.restoreAllMocks());

describe("projects form — App path", () => {
  it("loads the stored app path and saves it back", async () => {
    const puts: { url: string; body: Record<string, unknown> }[] = [];
    renderProjects(puts);
    expect(await editFluxor()).toHaveValue("/apps/fluxor/");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await vi.waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].url).toBe("/api/projects/fluxor");
    expect(puts[0].body.appPath).toBe("/apps/fluxor/");
  });

  it("clearing the field removes the app path", async () => {
    const puts: { url: string; body: Record<string, unknown> }[] = [];
    renderProjects(puts);
    await userEvent.clear(await editFluxor());
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await vi.waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body).not.toHaveProperty("appPath");
  });

  it("rejects a path without the trailing slash", async () => {
    const puts: { url: string; body: Record<string, unknown> }[] = [];
    renderProjects(puts);
    const field = await editFluxor();
    await userEvent.clear(field);
    await userEvent.type(field, "/apps/fluxor");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByText("expected /apps/<name>/")).toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });
});
