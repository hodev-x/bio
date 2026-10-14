import { APP_PATH_PATTERN } from "@bio/shared";
import type { Item } from "./hooks/useContent";

/** The project's app path when it is a valid "/apps/<name>/" path. */
export const appPathOf = (project: Item): string | undefined =>
  typeof project.appPath === "string" && APP_PATH_PATTERN.test(project.appPath) ? project.appPath : undefined;

/** Visible projects that open an app, in the order given. */
export const appsOf = (projects: Item[]): Item[] =>
  projects.filter((p) => p.visible !== false && appPathOf(p) !== undefined);
