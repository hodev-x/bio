import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModeProvider, useMode } from "../src/mode/ModeContext";

function Probe() { const { dev, toggle } = useMode(); return <button onClick={toggle}>{dev ? "on" : "off"}</button>; }
beforeEach(() => { localStorage.clear(); document.body.className = ""; });

describe("dev mode", () => {
  it("defaults off, toggles, persists, and tags body", async () => {
    render(<ModeProvider><Probe /></ModeProvider>);
    expect(screen.getByText("off")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText("on")).toBeInTheDocument();
    expect(document.body.classList.contains("mode-dev")).toBe(true);
    expect(localStorage.getItem("bio:mode")).toBe("dev");
  });
  it("restores from storage", () => {
    localStorage.setItem("bio:mode", "dev");
    render(<ModeProvider><Probe /></ModeProvider>);
    expect(screen.getByText("on")).toBeInTheDocument();
  });
});
