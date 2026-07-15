import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { AuthProvider, useAuth } from "../src/hooks/useAuth";
import { RequireAuth } from "../src/components/RequireAuth";
import { setAccessToken } from "../src/api/client";

const jwt = (sub: string) => `x.${btoa(JSON.stringify({ sub, typ: "access" }))}.y`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const Probe = () => { const a = useAuth(); return <p>{a.status}:{a.sub ?? "-"}</p>; };

beforeEach(() => { setAccessToken(null); vi.restoreAllMocks(); });

describe("useAuth", () => {
  it("restores a session via refresh on mount", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(200, { accessToken: jwt("admin"), expiresIn: 900 }));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText("authed:admin")).toBeInTheDocument();
  });

  it("lands on anon when refresh fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(401, {}));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText("anon:-")).toBeInTheDocument();
  });

  it("RequireAuth redirects anon users to /admin/login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(401, {}));
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route path="/admin/login" element={<p>login page</p>} />
            <Route path="/admin" element={<RequireAuth><p>secret</p></RequireAuth>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText("login page")).toBeInTheDocument();
  });
});
