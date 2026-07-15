import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../src/hooks/useAuth";
import { RequireAuth } from "../src/components/RequireAuth";
import { api, setAccessToken } from "../src/api/client";

const jwt = (sub: string) => `x.${btoa(JSON.stringify({ sub, typ: "access" }))}.y`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const Probe = () => { const a = useAuth(); return <p>{a.status}:{a.sub ?? "-"}</p>; };

const ProbeWithControls = () => {
  const a = useAuth();
  return (
    <div>
      <p>{a.status}:{a.sub ?? "-"}</p>
      <button onClick={() => a.signIn(jwt("admin"))}>sign in</button>
      <button onClick={() => { void api("/api/posts", { auth: true }).catch(() => undefined); }}>call</button>
    </div>
  );
};

const SignOutProbe = () => { const a = useAuth(); return <button onClick={() => { void a.signOut(); }}>sign out</button>; };

// AuthProvider reads a QueryClient (to clear the cache on sign out), just as
// it does in production (see src/main.tsx), so every render needs one in
// the tree; use a fresh client per call unless a test needs to inspect it.
const withQueryClient = (children: ReactNode, qc: QueryClient = new QueryClient()) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => { setAccessToken(null); vi.restoreAllMocks(); });

describe("useAuth", () => {
  it("restores a session via refresh on mount", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(200, { accessToken: jwt("admin"), expiresIn: 900 }));
    render(withQueryClient(<AuthProvider><Probe /></AuthProvider>));
    expect(await screen.findByText("authed:admin")).toBeInTheDocument();
  });

  it("lands on anon when refresh fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(401, {}));
    render(withQueryClient(<AuthProvider><Probe /></AuthProvider>));
    expect(await screen.findByText("anon:-")).toBeInTheDocument();
  });

  it("lands on anon (no unhandled rejection) when the mount refresh throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("network"));
    render(withQueryClient(<AuthProvider><Probe /></AuthProvider>));
    expect(await screen.findByText("anon:-")).toBeInTheDocument();
  });

  it("drops to anon when a mid-session refresh terminally fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(401, {})) // mount refresh -> anon initially
      .mockResolvedValueOnce(json(401, { error: "unauthorized" })) // authed call -> 401
      .mockResolvedValueOnce(json(401, { error: "unauthorized" })); // refresh attempt also fails
    render(withQueryClient(<AuthProvider><ProbeWithControls /></AuthProvider>));
    expect(await screen.findByText("anon:-")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "sign in" }));
    expect(await screen.findByText("authed:admin")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "call" }));
    expect(await screen.findByText("anon:-")).toBeInTheDocument();
  });

  it("clears the TanStack Query cache on sign out", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["content"], { profile: null });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(401, {})) // mount refresh -> anon
      .mockResolvedValueOnce(json(200, {})); // logout call
    render(withQueryClient(<AuthProvider><SignOutProbe /></AuthProvider>, qc));
    expect(qc.getQueryCache().getAll().length).toBeGreaterThan(0);
    await userEvent.click(await screen.findByRole("button", { name: "sign out" }));
    await waitFor(() => expect(qc.getQueryCache().getAll()).toHaveLength(0));
  });

  it("RequireAuth redirects anon users to /admin/login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(401, {}));
    render(withQueryClient(
      <AuthProvider>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route path="/admin/login" element={<p>login page</p>} />
            <Route path="/admin" element={<RequireAuth><p>secret</p></RequireAuth>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    ));
    expect(await screen.findByText("login page")).toBeInTheDocument();
  });
});
