import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { RegisterPage } from "../src/pages/admin/RegisterPage";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => vi.restoreAllMocks());

const ui = (register?: (o: unknown) => Promise<unknown>) => (
  <MemoryRouter><RegisterPage register={register} /></MemoryRouter>
);

describe("register", () => {
  it("registers with the bootstrap token and shows recovery codes once", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(200, { challenge: "c" }))
      .mockResolvedValueOnce(json(200, { verified: true, recoveryCodes: ["AAAA-1111", "BBBB-2222"] }));
    const register = vi.fn().mockResolvedValue({ id: "cred", response: {} });
    render(ui(register));
    await userEvent.type(screen.getByLabelText(/bootstrap token/i), "boot-tok");
    await userEvent.click(screen.getByRole("button", { name: /create passkey/i }));
    expect(await screen.findByText(/AAAA-1111/)).toBeInTheDocument();
    expect(register).toHaveBeenCalledWith({ challenge: "c" });
    // login link only appears after confirming codes were saved
    expect(screen.queryByText(/go to login/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /i saved my recovery codes/i }));
    expect(await screen.findByText(/go to login/i)).toBeInTheDocument();
  });

  it("shows the bootstrap error from the API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(401, { error: "bootstrap token required for first registration" }));
    render(ui());
    await userEvent.type(screen.getByLabelText(/bootstrap token/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /create passkey/i }));
    expect(await screen.findByText(/bootstrap token required/i)).toBeInTheDocument();
  });
});
