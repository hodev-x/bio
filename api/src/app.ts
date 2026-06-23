import Fastify, { type FastifyInstance } from "fastify";

export interface AppDeps {
  // data-access functions injected in later tasks; empty for the skeleton
}

export function buildApp(_deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/api/health", async () => ({ ok: true }));

  return app;
}
