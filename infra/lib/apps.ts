export type EnvName = "staging" | "prod";

/** App names become URL segments ("/apps/<name>/") and SSM path segments. */
export const APP_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Apps routed by each environment's distribution. An app's stack must publish
 * /platform/<env>/apps/<name>/{site-bucket-name,api-domain} before its name
 * is added here, or the deploy fails while resolving those parameters.
 */
export const APPS_BY_ENV: Record<EnvName, readonly string[]> = {
  staging: [],
  prod: [],
};

export function validateAppNames(apps: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  for (const name of apps) {
    if (!APP_NAME_PATTERN.test(name)) {
      throw new Error(`invalid app name ${JSON.stringify(name)}: expected ${APP_NAME_PATTERN}`);
    }
    if (seen.has(name)) throw new Error(`duplicate app name ${JSON.stringify(name)}`);
    seen.add(name);
  }
  return apps;
}
