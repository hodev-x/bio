/**
 * The same-origin path to continue to after sign-in, or null when `next` is
 * missing or could leave this site. Requires a single leading "/" (not "//"
 * or "/\", which browsers treat as another host) and re-checks the origin
 * after URL parsing, which drops tabs and newlines and collapses dot segments
 * (so "/.//host" must not end up as "//host").
 */
export function safeNext(next: string | null, origin: string): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  let url: URL;
  try {
    url = new URL(next, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || url.pathname.startsWith("//")) return null;
  return url.pathname + url.search + url.hash;
}

/** Paths under /apps/ belong to separately deployed apps, so leaving for one needs a full page load. */
export const isAppPath = (path: string) => path.startsWith("/apps/");
