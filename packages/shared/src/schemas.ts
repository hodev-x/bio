import { z } from "zod";

// Dates are YYYY, YYYY-MM, or YYYY-MM-DD strings (sorted lexicographically by the read API).
const isoDate = z.string().regex(/^\d{4}(-\d{2}){0,2}$/, "expected YYYY[-MM[-DD]]");
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "expected a kebab-case slug");

// `tech.*` payloads stay intentionally loose until real content is migrated (spec §3).
const tech = z.record(z.string(), z.unknown()).optional();

export const ProfileSchema = z.object({
  id: z.literal("me").default("me"),
  name: z.string().min(1),
  tagline: z.string().min(1),
  about: z.string().optional(),
  socials: z.record(z.string(), z.string().url()).default(() => ({})),
  visible: z.boolean().default(true),
}).strict();

export const ExperienceSchema = z.object({
  id: slug,
  role: z.string().min(1),
  company: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate.optional(),
  highlights: z.array(z.string().min(1)).default(() => []),
  tech,
  visible: z.boolean().default(true),
}).strict();

export const EducationSchema = z.object({
  id: slug,
  institution: z.string().min(1),
  degree: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate.optional(),
  visible: z.boolean().default(true),
}).strict();

export const SkillsGroupSchema = z.object({
  category: slug,
  items: z.array(z.string().min(1)).default(() => []),
  visible: z.boolean().default(true),
}).strict();

export const ProjectSchema = z.object({
  id: slug,
  title: z.string().min(1),
  desc: z.string().min(1),
  // Free-form on purpose (e.g. "active", "archived") until content migration pins values.
  status: z.string().min(1),
  repo: z.string().url().optional(),
  tech,
  visible: z.boolean().default(true),
}).strict();

export const PostSchema = z.object({
  slug,
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string().min(1)).default(() => []),
  publishedAt: z.string().datetime().default(() => new Date().toISOString()),
  visible: z.boolean().default(true),
}).strict();

// PUT is full-replace: requiring publishedAt prevents an innocent update from
// resetting it to "now" and reordering the public blog (gsi-by-date sort key).
export const PostPutSchema = PostSchema.extend({ publishedAt: z.string().datetime() });

export const VisiblePatchSchema = z.object({ visible: z.boolean() }).strict();

export const ENTITY_TYPES = ["profile", "experience", "education", "skills", "projects", "posts"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const SCHEMA_BY_TYPE = {
  profile: ProfileSchema,
  experience: ExperienceSchema,
  education: EducationSchema,
  skills: SkillsGroupSchema,
  projects: ProjectSchema,
  posts: PostSchema,
} as const;

// DynamoDB partition-key attribute per type (mirrors the table definitions in infra).
export const KEY_BY_TYPE: Record<EntityType, "id" | "category" | "slug"> = {
  profile: "id",
  experience: "id",
  education: "id",
  skills: "category",
  projects: "id",
  posts: "slug",
};

export type Profile = z.infer<typeof ProfileSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type SkillsGroup = z.infer<typeof SkillsGroupSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Post = z.infer<typeof PostSchema>;
