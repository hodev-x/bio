import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { ModeProvider } from "../src/mode/ModeContext";
import { PublicLayout } from "../src/components/PublicLayout";
import { TechChips } from "../src/components/TechChips";

const ui = (
  <ModeProvider><MemoryRouter><Routes>
    <Route element={<PublicLayout socials={{ github: "https://github.com/hodev-x" }} />}>
      <Route path="/" element={<TechChips tech={{ stack: ["ts", "aws"] }} />} />
    </Route>
  </Routes></MemoryRouter></ModeProvider>
);

describe("PublicLayout", () => {
  it("has the header links, a footer social link, and no admin link", () => {
    render(ui);
    expect(screen.getByRole("link", { name: /daniel hodeta/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /writing/i })).toHaveAttribute("href", "/blog");
    expect(screen.getByRole("link", { name: /github/i })).toHaveAttribute("href", "https://github.com/hodev-x");
    expect(screen.queryByRole("link", { name: /admin/i })).toBeNull();
  });
  it("dev toggle reveals tech chips inline", async () => {
    render(ui);
    expect(screen.queryByText(/ts, aws/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /dev mode/i }));
    expect(screen.getByText(/ts, aws/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dev mode/i })).toHaveAttribute("aria-pressed", "true");
  });
});
