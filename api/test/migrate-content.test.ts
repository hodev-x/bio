import { describe, it, expect, vi, beforeAll } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../scripts/migrate-content.js";

const fixture = {
  profile: { name: "Ada", title: "Engineer", company: "Co", team: "T", yearsExperience: "3+", tagline: "Builds things.", about: "Hi.", avatarUrl: "https://example.com/a.png", social: { github: "https://github.com/ada", email: "ada@example.com" }, tech: { about: ["x"] } },
  experience: [
    { id: "co-eng", company: "Co", team: "T", role: "Engineer", startDate: "2024-01", endDate: null, current: true, description: "Did X.", highlights: ["h1"], technologies: ["TS", "AWS"], visible: true, tech: { stack: ["AWS", "CDK"], notes: "n" } },
    { id: "co-intern", company: "Co", role: "Intern", startDate: "2021-06", endDate: "2021-08", current: false, description: "Did Y.", highlights: [], technologies: ["Java"], visible: true },
  ],
  education: [{ id: "uni", institution: "Uni", degree: "BS", startDate: "2018", endDate: "2022", highlights: ["r"], visible: true }],
  skills: [{ category: "Languages", items: ["TS"] }, { category: "Frameworks & Tools", items: ["CDK"] }],
  projects: [{ id: "p1", title: "P1", description: "Desc.", technologies: ["Python"], status: "completed", visible: true, tech: { stack: ["Python 3"] } }],
};

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "migrate-"));
  for (const [name, data] of Object.entries(fixture)) await writeFile(join(dir, `${name}.json`), JSON.stringify(data));
});

const res = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;

describe("run", () => {
  it("--env is informational: optional, and logged when given", async () => {
    const log = vi.fn();
    await run({ base: "https://x", from: dir, dryRun: true, log });
    expect(log.mock.calls.join("\n")).not.toContain("env:");
    const log2 = vi.fn();
    await run({ base: "https://x", from: dir, dryRun: true, env: "staging", log: log2 });
    expect(log2.mock.calls[0][0]).toBe("env: staging");
  });

  it("dry-run never fetches and logs the mapped JSON", async () => {
    const fetchImpl = vi.fn();
    const log = vi.fn();
    const r = await run({ base: "https://x", from: dir, dryRun: true, fetchImpl: fetchImpl as unknown as typeof fetch, log });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r.written).toBe(0);
    expect(log.mock.calls.join("\n")).toContain("frameworks-and-tools");
  });

  it("live: token exchange then one PUT per entity", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === "https://x/api/auth/token") return res(200, { accessToken: "T" });
      return res(200, {});
    });
    const r = await run({ base: "https://x/", from: dir, dryRun: false, apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, log: () => {} });
    const calls = fetchImpl.mock.calls;
    expect(calls).toHaveLength(8);
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ secret: "k" });
    const puts = calls.slice(1);
    expect(puts.every(([, init]) => init?.method === "PUT")).toBe(true);
    expect(puts.every(([, init]) => (init?.headers as Record<string, string>).authorization === "Bearer T")).toBe(true);
    expect(puts.map(([u]) => String(u))).toEqual([
      "https://x/api/profile",
      "https://x/api/experience/co-eng",
      "https://x/api/experience/co-intern",
      "https://x/api/education/uni",
      "https://x/api/skills/languages",
      "https://x/api/skills/frameworks-and-tools",
      "https://x/api/projects/p1",
    ]);
    expect(r.written).toBe(7);
  });

  it("requires BIO_API_KEY unless dry-run", async () => {
    await expect(run({ base: "https://x", from: dir, dryRun: false, fetchImpl: vi.fn() as unknown as typeof fetch, log: () => {} })).rejects.toThrow(/BIO_API_KEY/);
  });

  it("stops on a failed PUT and reports URL and body", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/api/auth/token") ? res(200, { accessToken: "T" }) : res(400, { error: "validation failed" }));
    await expect(run({ base: "https://x", from: dir, dryRun: false, apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, log: () => {} }))
      .rejects.toThrow(/\/api\/profile.*validation failed/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects on a failed token exchange and makes no PUT", async () => {
    const fetchImpl = vi.fn(async () => res(401, { error: "no" }));
    await expect(run({ base: "https://x", from: dir, dryRun: false, apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, log: () => {} }))
      .rejects.toThrow(/token exchange failed/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops after a 401 on the third PUT", async () => {
    let puts = 0;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/api/auth/token")) return res(200, { accessToken: "T" });
      puts += 1;
      return puts === 3 ? res(401, { error: "unauthorized" }) : res(200, {});
    });
    await expect(run({ base: "https://x", from: dir, dryRun: false, apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, log: () => {} }))
      .rejects.toThrow(/\/api\/experience\/co-intern/);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
