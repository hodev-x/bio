import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordField } from "../src/components/ArrayField";

// Stateful harness: feeds onChange back into value, like RHF's Controller does.
function Harness({ initial, onChange }: { initial: Record<string, string>; onChange?: (v: Record<string, string>) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <RecordField label="Socials" value={value}
      onChange={(next) => { setValue(next); onChange?.(next); }} />
  );
}

describe("RecordField", () => {
  it("+ add shows a new empty key/value input row", async () => {
    render(<Harness initial={{ github: "https://github.com/x" }} />);
    await userEvent.click(screen.getByRole("button", { name: /\+ add/i }));
    expect(screen.getByLabelText("Socials key 2")).toHaveValue("");
    expect(screen.getByLabelText("Socials value 2")).toHaveValue("");
  });

  it("typing a key and value in the added row emits that entry", async () => {
    const changes: Record<string, string>[] = [];
    render(<Harness initial={{}} onChange={(v) => changes.push(v)} />);
    await userEvent.click(screen.getByRole("button", { name: /\+ add/i }));
    await userEvent.type(screen.getByLabelText("Socials key 1"), "github");
    await userEvent.type(screen.getByLabelText("Socials value 1"), "https://github.com/x");
    expect(changes.at(-1)).toEqual({ github: "https://github.com/x" });
  });

  it("clearing an existing key keeps the row visible but drops it from onChange", async () => {
    const changes: Record<string, string>[] = [];
    render(<Harness initial={{ github: "https://github.com/x", web: "https://example.com" }} onChange={(v) => changes.push(v)} />);
    await userEvent.clear(screen.getByLabelText("Socials key 1"));
    // Row stays editable in the UI…
    expect(screen.getByLabelText("Socials key 1")).toHaveValue("");
    expect(screen.getByLabelText("Socials value 1")).toHaveValue("https://github.com/x");
    expect(screen.getByLabelText("Socials key 2")).toHaveValue("web");
    // …but the emitted value no longer includes the cleared key.
    expect(changes.at(-1)).toEqual({ web: "https://example.com" });
  });
});
