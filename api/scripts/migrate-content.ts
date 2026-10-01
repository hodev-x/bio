/**
 * Writes content exported from the previous site into the bio API.
 *   BIO_API_KEY=<env MCP client secret> pnpm --filter @bio/api exec tsx scripts/migrate-content.ts \
 *     --base https://staging.danielhodeta.com --from <dir with profile/experience/education/skills/projects .json> [--dry-run]
 * PUT is full replace, so re-running is safe.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { mapContent, type OldContent } from "./content-mapping.js";

export interface RunOptions { base: string; from: string; dryRun: boolean; apiKey?: string; fetchImpl?: typeof fetch; log?: (line: string) => void }

async function readJson(dir: string, name: string): Promise<unknown> {
  return JSON.parse(await readFile(join(dir, `${name}.json`), "utf8"));
}

export async function run(opts: RunOptions): Promise<{ written: number }> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const old = {
    profile: await readJson(opts.from, "profile"), experience: await readJson(opts.from, "experience"),
    education: await readJson(opts.from, "education"), skills: await readJson(opts.from, "skills"),
    projects: await readJson(opts.from, "projects"),
  } as OldContent;
  const content = mapContent(old);
  if (opts.dryRun) { log(JSON.stringify(content, null, 2)); return { written: 0 }; }
  if (!opts.apiKey) throw new Error("BIO_API_KEY is required (the env's MCP client secret)");

  const f = opts.fetchImpl ?? fetch;
  const base = opts.base.replace(/\/+$/, "");
  const tokenRes = await f(`${base}/api/auth/token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret: opts.apiKey }) });
  if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
  const { accessToken } = (await tokenRes.json()) as { accessToken: string };

  const writes: Array<[string, unknown]> = [
    ["/api/profile", content.profile],
    ...content.experience.map((e) => [`/api/experience/${encodeURIComponent(e.id)}`, e] as [string, unknown]),
    ...content.education.map((e) => [`/api/education/${encodeURIComponent(e.id)}`, e] as [string, unknown]),
    ...content.skills.map((s) => [`/api/skills/${encodeURIComponent(s.category)}`, s] as [string, unknown]),
    ...content.projects.map((p) => [`/api/projects/${encodeURIComponent(p.id)}`, p] as [string, unknown]),
  ];
  let written = 0;
  for (const [path, body] of writes) {
    const res = await f(`${base}${path}`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`PUT ${path} → ${res.status}: ${await res.text()}`);
    written += 1;
    log(`ok ${path}`);
  }
  return { written };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const base = arg("base"); const from = arg("from");
  if (!base || !from) { console.error("usage: migrate-content --base <url> --from <dir> [--dry-run]"); process.exit(2); }
  run({ base, from, dryRun: process.argv.includes("--dry-run"), apiKey: process.env.BIO_API_KEY })
    .then(({ written }) => console.log(`done: ${written} entities written`))
    .catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
