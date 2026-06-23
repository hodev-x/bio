import Fastify, { type FastifyInstance } from "fastify";
import { makeDocClient } from "./data/client.js";
import * as repo from "./data/content.js";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

type SiteContent = Awaited<ReturnType<typeof repo.getSiteContent>>;
type PostPage = Awaited<ReturnType<typeof repo.listPosts>>;

export interface AppDeps {
  getSiteContent?: (opts?: { includeHidden?: boolean }) => Promise<SiteContent>;
  listPosts?: (opts?: { limit?: number }) => Promise<PostPage>;
  getPost?: (slug: string) => Promise<repo.Item | null>;
}

export function buildApp(deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  // Default deps bind to the real DynamoDB repo; tests inject fakes.
  let ddb: DynamoDBDocumentClient | undefined;
  const client = () => (ddb ??= makeDocClient());
  const getSiteContent = deps.getSiteContent ?? ((opts) => repo.getSiteContent(client(), opts));
  const listPosts = deps.listPosts ?? ((opts) => repo.listPosts(client(), opts));
  const getPost = deps.getPost ?? ((slug) => repo.getPost(client(), slug));

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/content", async () => {
    return getSiteContent(); // public path: no includeHidden
  });

  app.get("/api/posts", async (req) => {
    const limit = Number((req.query as { limit?: string }).limit ?? 10);
    return listPosts({ limit });
  });

  app.get<{ Params: { slug: string } }>("/api/posts/:slug", async (req, reply) => {
    const post = await getPost(req.params.slug);
    if (!post || post.visible === false) return reply.code(404).send({ error: "not found" });
    return post;
  });

  return app;
}
