import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Meta } from "../src/components/Meta";

describe("Meta", () => {
  it("hoists title, description and og tags into head", async () => {
    render(<Meta title="T — Daniel Hodeta" description="D" />);
    await waitFor(() => expect(document.title).toBe("T — Daniel Hodeta"));
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("D");
    expect(document.head.querySelector('meta[property="og:title"]')?.getAttribute("content")).toBe("T — Daniel Hodeta");
  });
});
