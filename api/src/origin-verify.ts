import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";

// CloudFront adds x-origin-verify on every request it forwards to the API
// origin. Requests that reach the execute-api URL directly lack it (or forge
// it), so rejecting mismatches here means the rate limiter's XFF key can be
// trusted: only CloudFront-appended entries ever arrive.
export function registerOriginVerify(app: FastifyInstance, secret: string | undefined): void {
  if (!secret) return;
  const expected = Buffer.from(secret);
  app.addHook("onRequest", async (req, reply) => {
    const got = req.headers["x-origin-verify"];
    const buf = Buffer.from(typeof got === "string" ? got : "");
    if (buf.length !== expected.length || !timingSafeEqual(buf, expected)) {
      return reply.code(403).send({ error: "forbidden" });
    }
  });
}
