import { ProfileSchema, ExperienceSchema, EducationSchema, SkillsGroupSchema, ProjectSchema,
  type Profile, type Experience, type Education, type SkillsGroup, type Project } from "@bio/shared";

export type Raw = Record<string, unknown>;
export interface OldContent { profile: Raw; experience: Raw[]; education: Raw[]; skills: Raw[]; projects: Raw[] }
export interface NewContent { profile: Profile; experience: Experience[]; education: Education[]; skills: SkillsGroup[]; projects: Project[] }

const ALLOWED = {
  profile: ["name", "title", "company", "team", "yearsExperience", "tagline", "about", "avatarUrl", "social", "tech"],
  experience: ["id", "company", "team", "role", "startDate", "endDate", "current", "description", "highlights", "technologies", "visible", "tech"],
  education: ["id", "institution", "degree", "startDate", "endDate", "highlights", "visible"],
  skills: ["category", "items"],
  projects: ["id", "title", "description", "technologies", "status", "repo", "visible", "tech"],
} as const;

function checkKeys(kind: keyof typeof ALLOWED, item: Raw, label: string): void {
  const allowed = new Set<string>(ALLOWED[kind]);
  const extra = Object.keys(item).filter((k) => !allowed.has(k));
  if (extra.length) throw new Error(`${kind} ${label}: unknown field(s) ${extra.join(", ")}`);
}

export const kebab = (s: string): string =>
  s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function withStack(tech: unknown, technologies: unknown): Record<string, unknown> | undefined {
  const base = tech && typeof tech === "object" ? { ...(tech as Record<string, unknown>) } : {};
  const extra = Array.isArray(technologies) ? technologies.map(String) : [];
  const current = Array.isArray(base.stack) ? (base.stack as unknown[]).map(String) : [];
  const stack = [...current, ...extra.filter((t) => !current.includes(t))];
  if (stack.length) base.stack = stack;
  return Object.keys(base).length ? base : undefined;
}

const defined = <T extends Raw>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;

const toUrl = (v: unknown): string => {
  const s = String(v);
  return !s.includes("://") && !s.startsWith("mailto:") && s.includes("@") ? `mailto:${s}` : s;
};

export function mapContent(old: OldContent): NewContent {
  checkKeys("profile", old.profile, "me");
  const p = old.profile;
  const socials = Object.fromEntries(Object.entries((p.social as Raw | undefined) ?? {}).map(([k, v]) => [k, toUrl(v)]));
  const profile = ProfileSchema.parse(defined({
    name: p.name, tagline: p.tagline, about: p.about, title: p.title, company: p.company, team: p.team,
    avatarUrl: p.avatarUrl, socials, tech: p.tech,
  }));

  const experience = old.experience.map((e) => {
    checkKeys("experience", e, String(e.id));
    return ExperienceSchema.parse(defined({
      id: e.id, role: e.role, company: e.company, team: e.team, startDate: e.startDate, endDate: e.endDate,
      description: e.description, highlights: e.highlights, tech: withStack(e.tech, e.technologies), visible: e.visible,
    }));
  });

  const education = old.education.map((e) => {
    checkKeys("education", e, String(e.id));
    return EducationSchema.parse(defined({
      id: e.id, institution: e.institution, degree: e.degree, startDate: e.startDate, endDate: e.endDate,
      highlights: e.highlights, visible: e.visible,
    }));
  });

  const skills = old.skills.map((s, i) => {
    checkKeys("skills", s, String(s.category));
    return SkillsGroupSchema.parse({ category: kebab(String(s.category)), label: String(s.category), items: s.items, order: i });
  });

  const projects = old.projects.map((pr, i) => {
    checkKeys("projects", pr, String(pr.id));
    return ProjectSchema.parse(defined({
      id: pr.id, title: pr.title, desc: pr.description, status: pr.status, repo: pr.repo,
      tech: withStack(pr.tech, pr.technologies), visible: pr.visible, order: i,
    }));
  });

  return { profile, experience, education, skills, projects };
}
