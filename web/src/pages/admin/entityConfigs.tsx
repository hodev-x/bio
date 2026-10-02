import { ExperienceSchema, EducationSchema, SkillsGroupSchema, ProjectSchema } from "@bio/shared";
import type { ZodTypeAny } from "zod";

export type FieldSpec =
  | { kind: "text" | "textarea"; name: string; label: string }
  | { kind: "number"; name: string; label: string }
  | { kind: "array"; name: string; label: string }
  | { kind: "record"; name: string; label: string };

export interface EntityConfig {
  type: "experience" | "education" | "skills" | "projects";
  schema: ZodTypeAny;
  keyAttr: "id" | "category";
  titleAttr: string;
  fields: FieldSpec[];
}

export const experienceConfig: EntityConfig = {
  type: "experience", schema: ExperienceSchema, keyAttr: "id", titleAttr: "role",
  fields: [
    { kind: "text", name: "role", label: "Role" },
    { kind: "text", name: "company", label: "Company" },
    { kind: "text", name: "team", label: "Team" },
    { kind: "text", name: "startDate", label: "Start (YYYY-MM)" },
    { kind: "text", name: "endDate", label: "End (YYYY-MM, empty = current)" },
    { kind: "textarea", name: "description", label: "Description" },
    { kind: "array", name: "highlights", label: "Highlights" },
    { kind: "record", name: "tech", label: "Tech (key → value)" },
  ],
};

export const educationConfig: EntityConfig = {
  type: "education", schema: EducationSchema, keyAttr: "id", titleAttr: "institution",
  fields: [
    { kind: "text", name: "institution", label: "Institution" },
    { kind: "text", name: "degree", label: "Degree" },
    { kind: "text", name: "startDate", label: "Start (YYYY)" },
    { kind: "text", name: "endDate", label: "End (YYYY)" },
    { kind: "array", name: "highlights", label: "Highlights" },
  ],
};

export const skillsConfig: EntityConfig = {
  type: "skills", schema: SkillsGroupSchema, keyAttr: "category", titleAttr: "category",
  fields: [
    { kind: "text", name: "label", label: "Label" },
    { kind: "number", name: "order", label: "Order" },
    { kind: "array", name: "items", label: "Items" },
  ],
};

export const projectsConfig: EntityConfig = {
  type: "projects", schema: ProjectSchema, keyAttr: "id", titleAttr: "title",
  fields: [
    { kind: "text", name: "title", label: "Title" },
    { kind: "textarea", name: "desc", label: "Description" },
    { kind: "text", name: "status", label: "Status" },
    { kind: "text", name: "repo", label: "Repo URL" },
    { kind: "record", name: "tech", label: "Tech (key → value)" },
    { kind: "number", name: "order", label: "Order" },
  ],
};
