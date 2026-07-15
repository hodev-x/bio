import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../src/hooks/useAuth";
import { LoginPage } from "../src/pages/admin/LoginPage";
import { setAccessToken } from "../src/api/client";

const jwt = (sub: string) => `x.${btoa(JSON.stringify({ sub, typ: "access" }))}.y`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ui = (authenticate?: (o: unknown) => Promise<unknown>) => (
  <QueryClientProvider client={new QueryClient()}>
    <AuthProvider>
      <MemoryRouter initialEntries={["/admin/login"]}>
        <Routes>
          <Route path="/admin/login" element={<LoginPage authenticate={authenticate} />} />
          <Route path="/admin" element={<p>dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  </QueryClientProvider>
);

beforeEach(() => { setAccessToken(null); vi.restoreAllMocks(); });

describe("login", () => {
  it("passkey path: options → authenticator → verify → dashboard", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(401, {})) // mount refresh fails → anon
      .mockResolvedValueOnce(json(200, { challenge: "c" })) // login/options
      .mockResolvedValueOnce(json(200, { accessToken: jwt("admin"), expiresIn: 900 })); // login/verify
    const authenticate = vi.fn().mockResolvedValue({ id: "cred", response: {} });
    render(ui(authenticate));
    await userEvent.click(await screen.findByRole("button", { name: /sign in with passkey/i }));
    expect(await screen.findByText("dashboard")).toBeInTheDocument();
    expect(authenticate).toHaveBeenCalledWith({ challenge: "c" });
  });

  it("recovery path signs in with a code", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { accessToken: jwt("admin"), expiresIn: 900 })); // recovery
    render(ui());
    await userEvent.click(await screen.findByText(/use a recovery code/i));
    await userEvent.type(screen.getByLabelText(/recovery code/i), "AAAA-BBBB");
    await userEvent.click(screen.getByRole("button", { name: /recover/i }));
    expect(await screen.findByText("dashboard")).toBeInTheDocument();
  });

  it("shows an error banner when verification fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { challenge: "c" }))
      .mockResolvedValueOnce(json(401, { error: "authentication verification failed" }));
    render(ui(vi.fn().mockResolvedValue({ id: "cred" })));
    await userEvent.click(await screen.findByRole("button", { name: /sign in with passkey/i }));
    expect(await screen.findByText(/authentication verification failed/i)).toBeInTheDocument();
  });
});
