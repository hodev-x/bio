import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { AppsPage } from "../src/pages/public/AppsPage";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const content = (projects: unknown[]) => ({ profile: null, experience: [], education: [], skills: [], projects });
const project = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, title: id[0].toUpperCase() + id.slice(1), desc: `${id} description`, status: "active", visible: true, ...extra });

const ui = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><AppsPage /></MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => vi.restoreAllMocks());

describe("Apps page", () => {
  it("lists visible projects with an app path, in the order served", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(content([
      project("zeta", { appPath: "/apps/zeta/", status: "beta" }),
      project("plain"),
      project("secret", { appPath: "/apps/secret/", visible: false }),
      project("alpha", { appPath: "/apps/alpha/" }),
    ])));
    ui();
    expect(await screen.findByRole("heading", { level: 1, name: "Apps" })).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/apps/zeta/", "/apps/alpha/"]);
    expect(screen.getByRole("link", { name: "Open Zeta" })).toHaveTextContent("Open");
    expect(screen.getByText("zeta description")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.queryByText("Plain")).toBeNull();
    expect(screen.queryByText("Secret")).toBeNull();
  });

  it("ignores an app path that is not an /apps/<name>/ path", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(content([project("odd", { appPath: "javascript:alert(1)" })])));
    ui();
    expect(await screen.findByText("No apps yet.")).toBeInTheDocument();
  });

  it("shows an empty state when no project has an app", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(content([project("plain")])));
    ui();
    expect(await screen.findByText("No apps yet.")).toBeInTheDocument();
  });

  it("sets the page title", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(content([])));
    ui();
    await waitFor(() => expect(document.title).toBe("Apps — Daniel Hodeta"));
  });

  it("shows a retry on fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: "boom" }, 500));
    ui();
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
