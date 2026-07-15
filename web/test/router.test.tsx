import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AppRoutes } from "../src/router";

describe("router", () => {
  it("serves the public stub at /", () => {
    render(<MemoryRouter initialEntries={["/"]}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it("has an /admin/login route", () => {
    render(<MemoryRouter initialEntries={["/admin/login"]}><AppRoutes /></MemoryRouter>);
    expect(screen.getByText(/login/i)).toBeInTheDocument();
  });
});
