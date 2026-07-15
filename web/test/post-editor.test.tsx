import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router";
import { PostEditorPage } from "../src/pages/admin/PostEditorPage";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => vi.restoreAllMocks());

const ui = (path: string) => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/posts/new" element={<PostEditorPage mode="create" />} />
        <Route path="/admin/posts/:slug" element={<PostEditorPage mode="edit" />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
);

describe("post editor", () => {
  it("live-previews markdown while typing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ items: [] }));
    render(ui("/admin/posts/new"));
    await userEvent.type(screen.getByLabelText(/body/i), "# Hello preview");
    expect(await screen.findByRole("heading", { name: "Hello preview" })).toBeInTheDocument();
  });

  it("edit mode loads the post and PUTs with publishedAt intact", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push({ url: String(input), init });
      if (init?.method === "PUT") return json({ ok: true });
      return json({ slug: "hello", title: "Hello", body: "# Hi", tags: ["a"], publishedAt: "2026-07-01T00:00:00.000Z", visible: true });
    });
    render(ui("/admin/posts/hello"));
    const title = await screen.findByLabelText(/title/i);
    expect(title).toHaveValue("Hello");
    await userEvent.clear(title);
    await userEvent.type(title, "Hello v2");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    const put = calls.find((c) => c.init?.method === "PUT");
    expect(put?.url).toBe("/api/posts/hello");
    expect(JSON.parse(String(put?.init?.body))).toMatchObject({ title: "Hello v2", publishedAt: "2026-07-01T00:00:00.000Z" });
  });

  it("surfaces a failed edit-mode load and disables Save", async () => {
    // GET 401 and the client's refresh attempt also 401: the load must fail visibly.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: "unauthorized" }, 401));
    render(ui("/admin/posts/hello"));
    expect(await screen.findByText(/unauthorized|request failed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("surfaces a 409 duplicate slug on create", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) =>
      init?.method === "POST" ? json({ error: "slug already exists" }, 409) : json({ items: [] }));
    render(ui("/admin/posts/new"));
    await userEvent.type(screen.getByLabelText(/title/i), "T");
    await userEvent.type(screen.getByLabelText(/^slug/i), "dupe");
    await userEvent.type(screen.getByLabelText(/body/i), "b");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/slug already exists/i)).toBeInTheDocument();
  });
});
