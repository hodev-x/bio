import { describe, it, expect } from "vitest";
import {
  ProfileSchema, ExperienceSchema, SkillsGroupSchema, ProjectSchema, PostSchema,
  VisiblePatchSchema, ENTITY_TYPES, SCHEMA_BY_TYPE, KEY_BY_TYPE,
  EducationSchema, PostPutSchema,
} from "../src/index.js";

describe("entity schemas", () => {
  it("profile: applies defaults (id=me, visible=true) and accepts socials", () => {
    const p = ProfileSchema.parse({ name: "Daniel", tagline: "SDE", socials: { github: "https://github.com/d" } });
    expect(p.id).toBe("me");
    expect(p.visible).toBe(true);
  });

  it("profile: rejects unknown keys (strict)", () => {
    expect(ProfileSchema.safeParse({ name: "D", tagline: "t", nope: 1 }).success).toBe(false);
  });

  it("experience: requires id/role/company/startDate; defaults highlights to []", () => {
    const e = ExperienceSchema.parse({ id: "amazon-sde", role: "SDE", company: "Amazon", startDate: "2024-01" });
    expect(e.highlights).toEqual([]);
    expect(ExperienceSchema.safeParse({ id: "x", role: "r", company: "c", startDate: "Jan 2024" }).success).toBe(false);
  });

  it("skills group: keyed by category with string items", () => {
    const s = SkillsGroupSchema.parse({ category: "languages", items: ["TypeScript"] });
    expect(s.visible).toBe(true);
  });

  it("project: id must be a slug", () => {
    expect(ProjectSchema.safeParse({ id: "Bad Slug!", title: "t", desc: "d", status: "active" }).success).toBe(false);
    expect(ProjectSchema.safeParse({ id: "money-lens", title: "t", desc: "d", status: "active" }).success).toBe(true);
  });

  it("post: slug format enforced; publishedAt defaults to now; tags default []", () => {
    const p = PostSchema.parse({ slug: "hello-world", title: "Hi", body: "# md" });
    expect(p.tags).toEqual([]);
    expect(new Date(p.publishedAt).getTime()).toBeGreaterThan(0);
    expect(PostSchema.safeParse({ slug: "Bad Slug", title: "t", body: "b" }).success).toBe(false);
  });

  it("visible patch: exactly { visible: boolean }", () => {
    expect(VisiblePatchSchema.safeParse({ visible: false }).success).toBe(true);
    expect(VisiblePatchSchema.safeParse({ visible: "no" }).success).toBe(false);
    expect(VisiblePatchSchema.safeParse({ visible: true, extra: 1 }).success).toBe(false);
  });

  it("type maps cover every entity type", () => {
    for (const t of ENTITY_TYPES) {
      expect(SCHEMA_BY_TYPE[t]).toBeDefined();
      expect(["id", "category", "slug"]).toContain(KEY_BY_TYPE[t]);
    }
  });

  it("education: validates the full shape", () => {
    const e = EducationSchema.parse({ id: "mit", institution: "MIT", degree: "BSc", startDate: "2018" });
    expect(e.visible).toBe(true);
    expect(EducationSchema.safeParse({ id: "mit", degree: "BSc", startDate: "2018" }).success).toBe(false);
  });

  it("object/array defaults are per-parse (no shared references)", () => {
    const a = ProfileSchema.parse({ name: "D", tagline: "t" });
    const b = ProfileSchema.parse({ name: "D", tagline: "t" });
    expect(a.socials).not.toBe(b.socials);
    const p1 = PostSchema.parse({ slug: "a", title: "t", body: "b" });
    const p2 = PostSchema.parse({ slug: "b", title: "t", body: "b" });
    expect(p1.tags).not.toBe(p2.tags);
  });

  it("PostPutSchema requires publishedAt (full-replace PUT must not reset it)", () => {
    expect(PostPutSchema.safeParse({ slug: "a", title: "t", body: "b" }).success).toBe(false);
    expect(PostPutSchema.safeParse({ slug: "a", title: "t", body: "b", publishedAt: "2026-07-14T00:00:00.000Z" }).success).toBe(true);
  });
});
