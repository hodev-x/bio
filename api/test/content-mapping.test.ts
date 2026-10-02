import { describe, it, expect } from "vitest";
import { mapContent, kebab, type OldContent } from "../scripts/content-mapping.js";

const old = (): OldContent => ({
  profile: { name: "Ada", title: "Engineer", company: "Co", team: "T", yearsExperience: "3+", tagline: "Builds things.", about: "Hi.", avatarUrl: "https://example.com/a.png", social: { github: "https://github.com/ada", email: "ada@example.com" }, tech: { about: ["x"] } },
  experience: [
    { id: "co-eng", company: "Co", team: "T", role: "Engineer", startDate: "2024-01", endDate: null, current: true, description: "Did X.", highlights: ["h1"], technologies: ["TS", "AWS"], visible: true, tech: { stack: ["AWS", "CDK"], notes: "n" } },
    { id: "co-intern", company: "Co", role: "Intern", startDate: "2021-06", endDate: "2021-08", current: false, description: "Did Y.", highlights: [], technologies: ["Java"], visible: true },
  ],
  education: [{ id: "uni", institution: "Uni", degree: "BS", startDate: "2018", endDate: "2022", highlights: ["r"], visible: true }],
  skills: [{ category: "Languages", items: ["TS"] }, { category: "Frameworks & Tools", items: ["CDK"] }],
  projects: [{ id: "p1", title: "P1", description: "Desc.", technologies: ["Python"], status: "completed", visible: true, tech: { stack: ["Python 3"] } }],
});

describe("mapContent", () => {
  it("maps the profile: socials, mailto, drops yearsExperience, keeps title/company/team/avatar/tech", () => {
    const { profile } = mapContent(old());
    expect(profile.socials).toEqual({ github: "https://github.com/ada", email: "mailto:ada@example.com" });
    expect(profile).not.toHaveProperty("yearsExperience");
    expect(profile).toMatchObject({ title: "Engineer", company: "Co", team: "T", avatarUrl: "https://example.com/a.png", tech: { about: ["x"] } });
  });
  it("merges technologies into tech.stack (union, order kept), omits null endDate, drops current", () => {
    const [cur, intern] = mapContent(old()).experience;
    expect(cur.tech).toEqual({ stack: ["AWS", "CDK", "TS"], notes: "n" });
    expect(cur).not.toHaveProperty("endDate");
    expect(cur).not.toHaveProperty("current");
    expect(cur.description).toBe("Did X.");
    expect(intern.tech).toEqual({ stack: ["Java"] });
  });
  it("keeps education highlights", () => {
    expect(mapContent(old()).education[0].highlights).toEqual(["r"]);
  });
  it("kebab-cases skill categories, keeps the old name as label, and orders by index", () => {
    expect(mapContent(old()).skills).toEqual([
      { category: "languages", label: "Languages", items: ["TS"], order: 0, visible: true },
      { category: "frameworks-and-tools", label: "Frameworks & Tools", items: ["CDK"], order: 1, visible: true },
    ]);
    expect(kebab("CI/CD & Ops")).toBe("ci-cd-and-ops");
  });
  it("maps project description → desc, technologies → tech.stack, order by index", () => {
    expect(mapContent(old()).projects[0]).toMatchObject({ id: "p1", desc: "Desc.", order: 0, tech: { stack: ["Python 3", "Python"] } });
  });
  it("fails loudly on an unknown old field", () => {
    const o = old(); (o.experience[0] as Record<string, unknown>).surprise = 1;
    expect(() => mapContent(o)).toThrow(/experience co-eng: unknown field\(s\) surprise/);
  });
  it("rejects skill categories that collapse to the same slug", () => {
    const o = old(); o.skills = [{ category: "Frameworks & Tools", items: [] }, { category: "Frameworks and Tools", items: [] }];
    expect(() => mapContent(o)).toThrow(/skills frameworks-and-tools: duplicate key/);
  });
  it("rejects duplicate experience ids", () => {
    const o = old(); o.experience[1].id = "co-eng";
    expect(() => mapContent(o)).toThrow(/experience co-eng: duplicate key/);
  });
  it("rejects a skill category that is not a string", () => {
    const o = old(); o.skills = [{ items: ["x"] }];
    expect(() => mapContent(o)).toThrow(/skills 0: category must be a string/);
  });
  it("keeps visible: false", () => {
    const o = old(); o.education[0].visible = false;
    expect(mapContent(o).education[0].visible).toBe(false);
  });
});
