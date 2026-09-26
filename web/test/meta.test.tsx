import { describe, it, expect, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Meta } from "../src/components/Meta";
import { stripStaticMeta } from "../src/seo";

describe("Meta", () => {
  it("hoists title, description and og tags into head", async () => {
    render(<Meta title="T — Daniel Hodeta" description="D" />);
    await waitFor(() => expect(document.title).toBe("T — Daniel Hodeta"));
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("D");
    expect(document.head.querySelector('meta[property="og:title"]')?.getAttribute("content")).toBe("T — Daniel Hodeta");
  });

  describe("stripStaticMeta", () => {
    afterEach(() => {
      document.head.querySelectorAll('[data-static-meta-test]').forEach((n) => n.remove());
    });

    it("removes the static index.html tags so only the per-route ones remain", async () => {
      // Seeded exactly as web/index.html declares them.
      document.head.insertAdjacentHTML(
        "beforeend",
        [
          '<meta data-static-meta-test name="description" content="Daniel Hodeta — software engineer. Projects, experience, and a learning log.">',
          '<meta data-static-meta-test property="og:title" content="Daniel Hodeta">',
          '<meta data-static-meta-test property="og:description" content="Software engineer. Projects, experience, and a learning log.">',
          '<link data-static-meta-test rel="canonical" href="https://danielhodeta.com/">',
          '<meta data-static-meta-test property="og:url" content="https://danielhodeta.com/">',
        ].join(""),
      );

      stripStaticMeta();
      render(<Meta title="T — Daniel Hodeta" description="D" />);
      await waitFor(() => expect(document.title).toBe("T — Daniel Hodeta"));

      const ogTitles = document.head.querySelectorAll('meta[property="og:title"]');
      const descriptions = document.head.querySelectorAll('meta[name="description"]');
      expect(ogTitles).toHaveLength(1);
      expect(ogTitles[0].getAttribute("content")).toBe("T — Daniel Hodeta");
      expect(descriptions).toHaveLength(1);
      expect(descriptions[0].getAttribute("content")).toBe("D");
    });
  });
});
