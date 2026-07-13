import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import fastifyCookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { makeDocClient } from "./data/client.js";
import * as repo from "./data/content.js";
import * as authRepo from "./data/auth.js";
import * as writeRepo from "./data/content-write.js";
import {
  SCHEMA_BY_TYPE, KEY_BY_TYPE, ENTITY_TYPES, VisiblePatchSchema, type EntityType,
} from "@bio/shared";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { loadAuthConfig } from "./auth/config.js";
import { verifySecret } from "./auth/hash.js";
import { hashSecret, generateRecoveryCodes } from "./auth/hash.js";
import { signAccessToken, signRefreshToken, verifyToken } from "./auth/jwt.js";
import { makeRequireAuth, principalFrom } from "./auth/middleware.js";
import {
  generateRegistration,
  verifyRegistration,
  generateAuthentication,
  verifyAuthentication,
} from "./auth/webauthn.js";
import type { VerifyRegistrationResponseOpts, VerifyAuthenticationResponseOpts } from "@simplewebauthn/server";
import type { VerifiedRegistrationResponse, VerifiedAuthenticationResponse } from "@simplewebauthn/server";
import type {
  generateRegistrationOptions,
  generateAuthenticationOptions,
} from "@simplewebauthn/server";
import { randomUUID, timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

type SiteContent = Awaited<ReturnType<typeof repo.getSiteContent>>;
type PostPage = Awaited<ReturnType<typeof repo.listPosts>>;

export interface AuthConfigShape {
  jwtSigningKey: string;
  mcpClientSecretHash: string;
  passkeyBootstrapToken: string;
}

/** Injected WebAuthn function signatures (mirrors the real wrappers for test injection). */
export type GenerateRegistrationFn = () => Promise<Awaited<ReturnType<typeof generateRegistrationOptions>>>;
export type VerifyRegistrationFn = (opts: VerifyRegistrationResponseOpts) => Promise<VerifiedRegistrationResponse>;
export type GenerateAuthenticationFn = () => Promise<Awaited<ReturnType<typeof generateAuthenticationOptions>>>;
export type VerifyAuthenticationFn = (opts: VerifyAuthenticationResponseOpts) => Promise<VerifiedAuthenticationResponse>;

export interface AppDeps {
  getSiteContent?: (opts?: { includeHidden?: boolean }) => Promise<SiteContent>;
  listPosts?: (opts?: { limit?: number }) => Promise<PostPage>;
  getPost?: (slug: string) => Promise<repo.Item | null>;
  getAuthConfig?: () => Promise<AuthConfigShape>;
  verifyMcpSecret?: (secret: string) => Promise<boolean>;
  // Auth data layer — injectable so tests don't touch DynamoDB.
  countCredentials?: () => Promise<number>;
  getCredential?: (id: string) => Promise<authRepo.Credential | null>;
  saveCredential?: (cred: authRepo.Credential) => Promise<void>;
  saveChallenge?: (id: string, challenge: string, ttl: number) => Promise<void>;
  consumeChallenge?: (id: string) => Promise<string | null>;
  saveRecoveryCodes?: (hashes: string[]) => Promise<void>;
  consumeRecoveryCode?: (code: string) => Promise<boolean>;
  // WebAuthn ceremony functions — injectable for tests (no real authenticator needed).
  doGenerateRegistration?: GenerateRegistrationFn;
  doVerifyRegistration?: VerifyRegistrationFn;
  doGenerateAuthentication?: GenerateAuthenticationFn;
  doVerifyAuthentication?: VerifyAuthenticationFn;
  // Content write layer — injectable so tests don't touch DynamoDB.
  putEntity?: (type: EntityType, item: Record<string, unknown>) => Promise<void>;
  deleteEntity?: (type: EntityType, key: string) => Promise<void>;
  patchVisible?: (type: EntityType, key: string, visible: boolean) => Promise<boolean>;
}

export async function buildApp(deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: true });

  // Register cookie plugin (required for flowId + refresh token cookies).
  await app.register(fastifyCookie);

  // Brute-force guard: only /api/auth/* is limited (token, login, register, recovery).
  await app.register(rateLimit, {
    max: 10,
    timeWindow: "1 minute",
    allowList: (req) => !req.url.startsWith("/api/auth/"),
  });

  // Default deps bind to the real DynamoDB repo; tests inject fakes.
  let ddb: DynamoDBDocumentClient | undefined;
  const client = () => (ddb ??= makeDocClient());
  const getSiteContent = deps.getSiteContent ?? ((opts) => repo.getSiteContent(client(), opts));
  const listPosts = deps.listPosts ?? ((opts) => repo.listPosts(client(), opts));
  const getPost = deps.getPost ?? ((slug) => repo.getPost(client(), slug));

  // Auth config deps: real defaults load from SSM; tests inject fakes.
  const getAuthConfig = deps.getAuthConfig ?? (() => loadAuthConfig());
  const verifyMcpSecret =
    deps.verifyMcpSecret ??
    (async (secret: string) => {
      const cfg = await getAuthConfig();
      return verifySecret(secret, cfg.mcpClientSecretHash);
    });

  // Auth data layer deps.
  const countCredentials = deps.countCredentials ?? (() => authRepo.countCredentials(client()));
  const getCredential = deps.getCredential ?? ((id) => authRepo.getCredential(client(), id));
  const saveCredential = deps.saveCredential ?? ((cred) => authRepo.saveCredential(client(), cred));
  const saveChallenge = deps.saveChallenge ?? ((id, ch, ttl) => authRepo.saveChallenge(client(), id, ch, ttl));
  const consumeChallenge = deps.consumeChallenge ?? ((id) => authRepo.consumeChallenge(client(), id));
  const doSaveRecoveryCodes = deps.saveRecoveryCodes ?? ((hashes) => authRepo.saveRecoveryCodes(client(), hashes));
  const doConsumeRecoveryCode = deps.consumeRecoveryCode ?? ((code) => authRepo.consumeRecoveryCode(client(), code));

  // WebAuthn ceremony deps — real defaults or injected fakes.
  const doGenerateRegistration = deps.doGenerateRegistration ?? generateRegistration;
  const doVerifyRegistration = deps.doVerifyRegistration ?? verifyRegistration;
  const doGenerateAuthentication = deps.doGenerateAuthentication ?? generateAuthentication;
  const doVerifyAuthentication = deps.doVerifyAuthentication ?? verifyAuthentication;

  // Content write layer deps.
  const putEntity = deps.putEntity ?? ((type, item) => writeRepo.putEntity(client(), type, item));
  const deleteEntity = deps.deleteEntity ?? ((type, key) => writeRepo.deleteEntity(client(), type, key));
  const patchVisible = deps.patchVisible ?? ((type, key, v) => writeRepo.patchVisible(client(), type, key, v));

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

  // ── Passkey registration ─────────────────────────────────────────────────────

  /**
   * POST /api/auth/register/options
   * First registration (no creds in DB): requires bootstrapToken in body.
   * Subsequent registrations: require a valid access token (admin already logged in).
   */
  app.post<{ Body: { bootstrapToken?: string } }>("/api/auth/register/options", async (req, reply) => {
    const count = await countCredentials();
    if (count === 0) {
      // Bootstrap gate: first passkey registration is gated by the one-time bootstrap token.
      const cfg = await getAuthConfig();
      if (!req.body?.bootstrapToken || !safeEqual(req.body.bootstrapToken, cfg.passkeyBootstrapToken)) {
        return reply.code(401).send({ error: "bootstrap token required for first registration" });
      }
    } else {
      // Subsequent registrations: require a valid access token (logged-in admin).
      const sub = await principalFrom(req, authCtx);
      if (!sub) return reply.code(401).send({ error: "unauthorized" });
    }

    const options = await doGenerateRegistration();
    const flowId = randomUUID();
    await saveChallenge(flowId, options.challenge, 60);

    reply.setCookie("flowId", flowId, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/auth",
    });

    return options;
  });

  /**
   * POST /api/auth/register/verify
   * Completes passkey registration. Reads flowId cookie, verifies the response,
   * stores the credential, generates recovery codes (returned once, plaintext).
   */
  app.post("/api/auth/register/verify", async (req, reply) => {
    const flowId = req.cookies?.flowId;
    if (!flowId) return reply.code(401).send({ error: "missing flow cookie" });

    const challenge = await consumeChallenge(flowId);
    if (!challenge) return reply.code(401).send({ error: "challenge expired or invalid" });

    const verification = await doVerifyRegistration({
      response: req.body as Parameters<typeof doVerifyRegistration>[0]["response"],
      expectedChallenge: challenge,
      expectedOrigin: process.env.RP_ORIGIN ?? "http://localhost:3000",
      expectedRPID: process.env.RP_ID ?? "localhost",
    });

    if (!verification.verified || !verification.registrationInfo) {
      return reply.code(400).send({ error: "registration verification failed" });
    }

    const { credential } = verification.registrationInfo;
    // publicKey is Uint8Array in v11; store as hex for DynamoDB.
    const publicKeyHex = Buffer.from(credential.publicKey).toString("hex");

    await saveCredential({
      id: credential.id,
      type: "passkey",
      publicKey: publicKeyHex,
      counter: credential.counter,
      transports: (credential.transports ?? []) as string[],
    });

    // Generate recovery codes: plaintext returned once, hashes stored.
    const plainCodes = generateRecoveryCodes(8);
    const hashes = await Promise.all(plainCodes.map((c) => hashSecret(c)));
    await doSaveRecoveryCodes(hashes);

    reply.clearCookie("flowId", { path: "/api/auth" });

    return { verified: true, recoveryCodes: plainCodes };
  });

  // ── Passkey login ─────────────────────────────────────────────────────────────

  /**
   * POST /api/auth/login/options
   * Generates WebAuthn authentication options and stores the challenge.
   */
  app.post("/api/auth/login/options", async (_req, reply) => {
    const options = await doGenerateAuthentication();
    const flowId = randomUUID();
    await saveChallenge(flowId, options.challenge, 60);

    reply.setCookie("flowId", flowId, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/auth",
    });

    return options;
  });

  /**
   * POST /api/auth/login/verify
   * Verifies the WebAuthn authentication response.
   * On success: updates counter, issues access token, sets refresh cookie.
   */
  app.post("/api/auth/login/verify", async (req, reply) => {
    const flowId = req.cookies?.flowId;
    if (!flowId) return reply.code(401).send({ error: "missing flow cookie" });

    const challenge = await consumeChallenge(flowId);
    if (!challenge) return reply.code(401).send({ error: "challenge expired or invalid" });

    // Look up the credential by id from the request body.
    const body = req.body as { id?: string };
    const credentialId = body?.id;
    if (!credentialId) return reply.code(400).send({ error: "missing credential id" });

    const stored = await getCredential(credentialId);
    if (!stored || stored.type !== "passkey" || !stored.publicKey) {
      return reply.code(401).send({ error: "credential not found" });
    }

    // Reconstruct the WebAuthnCredential for verifyAuthenticationResponse.
    const credential = {
      id: stored.id,
      publicKey: new Uint8Array(Buffer.from(stored.publicKey, "hex")),
      counter: stored.counter ?? 0,
      transports: (stored.transports ?? []) as Parameters<typeof doVerifyAuthentication>[0]["credential"]["transports"],
    };

    const verification = await doVerifyAuthentication({
      response: req.body as Parameters<typeof doVerifyAuthentication>[0]["response"],
      expectedChallenge: challenge,
      expectedOrigin: process.env.RP_ORIGIN ?? "http://localhost:3000",
      expectedRPID: process.env.RP_ID ?? "localhost",
      credential,
    });

    if (!verification.verified) {
      return reply.code(401).send({ error: "authentication verification failed" });
    }

    if (!verification.authenticationInfo.userVerified) {
      return reply.code(401).send({ error: "user verification required" });
    }

    // Update the stored counter to prevent replay attacks.
    await saveCredential({
      ...stored,
      counter: verification.authenticationInfo.newCounter,
    });

    const cfg = await getAuthConfig();
    const accessToken = await signAccessToken(cfg.jwtSigningKey, { sub: "admin" });
    const refreshToken = await signRefreshToken(cfg.jwtSigningKey, { sub: "admin" });

    reply.clearCookie("flowId", { path: "/api/auth" });
    reply.setCookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/api/auth",
    });

    return { accessToken, expiresIn: 900 };
  });

  // ── Refresh / Logout / Recovery ───────────────────────────────────────────────

  /**
   * POST /api/auth/refresh
   * Exchanges a valid refresh cookie for a new access token.
   * Enforces typ === "refresh" to prevent access tokens being used here.
   */
  app.post("/api/auth/refresh", async (req, reply) => {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) return reply.code(401).send({ error: "no refresh token" });

    const cfg = await getAuthConfig();
    let claims;
    try {
      claims = await verifyToken(cfg.jwtSigningKey, refreshToken);
    } catch {
      return reply.code(401).send({ error: "invalid refresh token" });
    }

    // Security: only refresh tokens are accepted here.
    if (claims.typ !== "refresh") return reply.code(401).send({ error: "invalid token type" });

    const accessToken = await signAccessToken(cfg.jwtSigningKey, { sub: claims.sub });
    return { accessToken, expiresIn: 900 };
  });

  /**
   * POST /api/auth/logout
   * Clears the refresh token cookie (client-side invalidation).
   */
  app.post("/api/auth/logout", async (_req, reply) => {
    reply.clearCookie("refreshToken", { path: "/api/auth" });
    return { ok: true };
  });

  /**
   * POST /api/auth/recovery
   * Exchanges a valid one-time recovery code for an access token.
   * The code is consumed (marked used) and cannot be reused.
   */
  app.post<{ Body: { code?: string } }>("/api/auth/recovery", async (req, reply) => {
    const code = req.body?.code ?? "";
    if (!code) return reply.code(401).send({ error: "recovery code required" });

    const ok = await doConsumeRecoveryCode(code);
    if (!ok) return reply.code(401).send({ error: "invalid or already-used recovery code" });

    const cfg = await getAuthConfig();
    const accessToken = await signAccessToken(cfg.jwtSigningKey, { sub: "admin" });
    return { accessToken, expiresIn: 900 };
  });

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

  // ── Content write routes ─────────────────────────────────────────────────────

  const badRequest = (reply: FastifyReply, issues: unknown) =>
    reply.code(400).send({ error: "validation failed", issues });

  app.put("/api/profile", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = SCHEMA_BY_TYPE.profile.safeParse({ ...(req.body as object ?? {}), id: "me" });
    if (!parsed.success) return badRequest(reply, parsed.error.flatten().fieldErrors);
    await putEntity("profile", parsed.data);
    return parsed.data;
  });

  for (const type of ["experience", "education", "skills", "projects"] as const) {
    const keyAttr = KEY_BY_TYPE[type];
    app.put<{ Params: { key: string } }>(`/api/${type}/:key`, { preHandler: requireAuth }, async (req, reply) => {
      // The URL is the source of truth for the key; a conflicting body key is overwritten.
      const parsed = SCHEMA_BY_TYPE[type].safeParse({ ...(req.body as object ?? {}), [keyAttr]: req.params.key });
      if (!parsed.success) return badRequest(reply, parsed.error.flatten().fieldErrors);
      await putEntity(type, parsed.data as Record<string, unknown>);
      return parsed.data;
    });
    app.delete<{ Params: { key: string } }>(`/api/${type}/:key`, { preHandler: requireAuth }, async (req, reply) => {
      await deleteEntity(type, req.params.key);
      return reply.code(204).send();
    });
  }

  app.patch<{ Params: { type: string; key: string } }>("/api/:type/:key", { preHandler: requireAuth }, async (req, reply) => {
    if (!(ENTITY_TYPES as readonly string[]).includes(req.params.type)) {
      return reply.code(404).send({ error: "unknown type" });
    }
    const type = req.params.type as EntityType;
    const parsed = VisiblePatchSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.flatten().fieldErrors);
    const found = await patchVisible(type, req.params.key, parsed.data.visible);
    if (!found) return reply.code(404).send({ error: "not found" });
    return { [KEY_BY_TYPE[type]]: req.params.key, visible: parsed.data.visible };
  });

  return app;
}
