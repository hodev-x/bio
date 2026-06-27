import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyToken } from "./jwt.js";

export interface AuthCtx {
  getKey: () => Promise<string>;
}

// Returns the principal sub if a valid access token is present, else null.
export async function principalFrom(req: FastifyRequest, ctx: AuthCtx): Promise<string | null> {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) return null;
  try {
    const claims = await verifyToken(await ctx.getKey(), header.slice(7));
    // Security: refresh tokens must NOT be accepted where an access token is required.
    return claims.typ === "access" ? claims.sub : null;
  } catch {
    return null;
  }
}

export function makeRequireAuth(ctx: AuthCtx) {
  return async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
    const sub = await principalFrom(req, ctx);
    if (!sub) return reply.code(401).send({ error: "unauthorized" });
    (req as FastifyRequest & { principal?: string }).principal = sub;
  };
}
