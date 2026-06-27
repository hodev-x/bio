import Fastify, { type FastifyInstance } from "fastify";
import { makeDocClient } from "./data/client.js";
import * as repo from "./data/content.js";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { loadAuthConfig } from "./auth/config.js";
import { verifySecret } from "./auth/hash.js";
import { signAccessToken } from "./auth/jwt.js";
import { makeRequireAuth, principalFrom } from "./auth/middleware.js";

type SiteContent = Awaited<ReturnType<typeof repo.getSiteContent>>;
type PostPage = Awaited<ReturnType<typeof repo.listPosts>>;

export interface AuthConfigShape {
  jwtSigningKey: string;
  mcpClientSecretHash: string;
  passkeyBootstrapToken: string;
}

export interface AppDeps {
  getSiteContent?: (opts?: { includeHidden?: boolean }) => Promise<SiteContent>;
  listPosts?: (opts?: { limit?: number }) => Promise<PostPage>;
  getPost?: (slug: string) => Promise<repo.Item | null>;
  getAuthConfig?: () => Promise<AuthConfigShape>;
  verifyMcpSecret?: (secret: string) => Promise<boolean>;
}

export function buildApp(deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  // Default deps bind to the real DynamoDB repo; tests inject fakes.
  let ddb: DynamoDBDocumentClient | undefined;
  const client = () => (ddb ??= makeDocClient());
  const getSiteContent = deps.getSiteContent ?? ((opts) => repo.getSiteContent(client(), opts));
  const listPosts = deps.listPosts ?? ((opts) => repo.listPosts(client(), opts));
  const getPost = deps.getPost ?? ((slug) => repo.getPost(client(), slug));

  // Auth deps: real defaults load from SSM; tests inject fakes.
  const getAuthConfig = deps.getAuthConfig ?? (() => loadAuthConfig());
  const verifyMcpSecret =
    deps.verifyMcpSecret ??
    (async (secret: string) => {
      const cfg = await getAuthConfig();
      return verifySecret(secret, cfg.mcpClientSecretHash);
    });

  // Auth context for middleware (reads signing key from config).
  const authCtx = { getKey: async () => (await getAuthConfig()).jwtSigningKey };
  const requireAuth = makeRequireAuth(authCtx);

  app.get("/api/health", async () => ({ ok: true }));

  // ── Auth routes ──────────────────────────────────────────────────────────────

  app.post<{ Body: { secret?: string } }>("/api/auth/token", async (req, reply) => {
    const secret = req.body?.secret ?? "";
    if (!secret || !(await verifyMcpSecret(secret))) {
      return reply.code(401).send({ error: "invalid secret" });
    }
    const key = (await getAuthConfig()).jwtSigningKey;
    return { accessToken: await signAccessToken(key, { sub: "mcp" }), expiresIn: 900 };
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (req) => ({
    sub: (req as unknown as { principal?: string }).principal,
  }));

  // ── Content routes ───────────────────────────────────────────────────────────

  app.get<{ Querystring: { includeHidden?: string } }>("/api/content", async (req) => {
    // includeHidden is ONLY honored when a valid access token is present.
    // Public path always receives unfiltered (non-hidden) content.
    const wantsHidden = req.query.includeHidden === "true";
    const sub = wantsHidden ? await principalFrom(req, authCtx) : null;
    return getSiteContent(sub ? { includeHidden: true } : undefined);
  });

  app.get("/api/posts", async (req) => {
    const raw = (req.query as { limit?: string }).limit;
    const parsed = Number.parseInt(raw ?? "", 10);
    const limit = Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 10;
    return listPosts({ limit });
  });

  app.get<{ Params: { slug: string } }>("/api/posts/:slug", async (req, reply) => {
    const post = await getPost(req.params.slug);
    if (!post || post.visible === false) return reply.code(404).send({ error: "not found" });
    return post;
  });

  return app;
}
