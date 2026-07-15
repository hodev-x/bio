import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AppRoutes } from "../src/router";
import { AuthProvider } from "../src/hooks/useAuth";
import { setAccessToken } from "../src/api/client";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => { setAccessToken(null); vi.restoreAllMocks(); });

describe("router", () => {
  it("serves the public stub at /", () => {
    render(<MemoryRouter initialEntries={["/"]}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it("has an /admin/login route", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(401, {})); // mount refresh fails → anon
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/admin/login"]}><AppRoutes /></MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText(/login/i)).toBeInTheDocument();
  });
});
