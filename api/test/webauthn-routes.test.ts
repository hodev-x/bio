/**
 * WebAuthn route tests — all WebAuthn ceremony functions and data-layer deps are injected
 * as fakes so no real authenticator or AWS is touched.
 *
 * v11 API notes:
 *  - verifyRegistration returns { verified, registrationInfo: { credential: { id, publicKey: Uint8Array, counter, transports } } }
 *  - verifyAuthentication returns { verified, authenticationInfo: { credentialID, newCounter, ... } }
 */
import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import { signRefreshToken, signAccessToken } from "../src/auth/jwt.js";

const KEY = "test-signing-key-at-least-32-bytes-long-xxxxxx";
const BOOTSTRAP = "bootstrap-token-secret";

// ── Fake store ───────────────────────────────────────────────────────────────
// Simple in-memory implementations shared across tests in a suite.

type Credential = {
  id: string;
  type: "passkey" | "recovery";
  publicKey?: string;
  counter?: number;
  transports?: string[];
  hash?: string;
  used?: boolean;
};

function makeFakeStore() {
  const credentials = new Map<string, Credential>();
  const challenges = new Map<string, string>();
  // recovery: { hash, used }
  const recoveryCodes: Array<{ hash: string; used: boolean }> = [];

  return {
    credentials,
    challenges,
    recoveryCodes,

    countCredentials: async () =>
      [...credentials.values()].filter((c) => c.type === "passkey").length,
    getCredential: async (id: string) => credentials.get(id) ?? null,
    saveCredential: async (cred: Credential) => { credentials.set(cred.id, cred); },
    saveChallenge: async (id: string, ch: string, _ttl: number) => { challenges.set(id, ch); },
    consumeChallenge: async (id: string) => {
      const ch = challenges.get(id) ?? null;
      challenges.delete(id);
      return ch;
    },
    saveRecoveryCodes: async (hashes: string[]) => {
      for (const hash of hashes) recoveryCodes.push({ hash, used: false });
    },
    consumeRecoveryCode: async (code: string) => {
      // Fake: treat the code itself as the hash (for simplicity in tests).
      const entry = recoveryCodes.find((r) => !r.used && r.hash === code);
      if (!entry) return false;
      entry.used = true;
      return true;
    },
  };
}

// ── Fake WebAuthn functions ──────────────────────────────────────────────────

const FAKE_CHALLENGE = "fake-challenge-base64url";
const FAKE_CRED_ID = "fake-credential-id";
const FAKE_PUBLIC_KEY_HEX = Buffer.alloc(65, 0xab).toString("hex"); // any 65 bytes
const FAKE_PUBLIC_KEY_BYTES = new Uint8Array(Buffer.from(FAKE_PUBLIC_KEY_HEX, "hex"));

const fakeWebAuthn = {
  doGenerateRegistration: async () => ({
    challenge: FAKE_CHALLENGE,
    rp: { name: "Bio", id: "localhost" },
    user: { id: "YWRtaW4", name: "admin", displayName: "Admin" },
    pubKeyCredParams: [],
    timeout: 60000,
    attestation: "none" as const,
    excludeCredentials: [],
    authenticatorSelection: {},
    extensions: {},
  }),

  doVerifyRegistration: async (_opts: unknown) => ({
    verified: true,
    registrationInfo: {
      credential: {
        id: FAKE_CRED_ID,
        publicKey: FAKE_PUBLIC_KEY_BYTES,
        counter: 0,
        transports: ["internal" as const],
      },
      fmt: "none" as const,
      aaguid: "00000000-0000-0000-0000-000000000000",
      credentialType: "public-key" as const,
      attestationObject: new Uint8Array(0),
      userVerified: true,
      credentialDeviceType: "singleDevice" as const,
      credentialBackedUp: false,
      origin: "http://localhost:3000",
    },
  }),

  doGenerateAuthentication: async () => ({
    challenge: FAKE_CHALLENGE,
    rpId: "localhost",
    allowCredentials: [],
    userVerification: "preferred" as const,
    timeout: 60000,
    extensions: {},
  }),

  doVerifyAuthentication: async (_opts: unknown) => ({
    verified: true,
    authenticationInfo: {
      credentialID: FAKE_CRED_ID,
      newCounter: 1,
      userVerified: true,
      credentialDeviceType: "singleDevice" as const,
      credentialBackedUp: false,
      origin: "http://localhost:3000",
      rpID: "localhost",
    },
  }),
};

// Fake that always returns verified: false
const fakeVerifyRegistrationFail = async (_opts: unknown) => ({
  verified: false,
  registrationInfo: undefined,
});

const fakeVerifyAuthenticationFail = async (_opts: unknown) => ({
  verified: false,
  authenticationInfo: {
    credentialID: FAKE_CRED_ID,
    newCounter: 0,
    userVerified: false,
    credentialDeviceType: "singleDevice" as const,
    credentialBackedUp: false,
    origin: "http://localhost:3000",
    rpID: "localhost",
  },
});

// ── Shared auth config dep ───────────────────────────────────────────────────

const authConfig = {
  getAuthConfig: async () => ({
    jwtSigningKey: KEY,
    mcpClientSecretHash: "x:y",
    passkeyBootstrapToken: BOOTSTRAP,
  }),
};

// ── Helper: build an app with all fake deps for a fresh store ─────────────────

function buildTestApp(store: ReturnType<typeof makeFakeStore>, overrides: object = {}) {
  return buildApp({
    ...authConfig,
    ...store,
    ...fakeWebAuthn,
    ...overrides,
  });
}

// ── Cookie extraction helper ──────────────────────────────────────────────────

function extractCookie(headers: Record<string, string | string[]>, name: string): string | undefined {
  const raw = headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const c of cookies) {
    const [pair] = c.split(";");
    const [k, v] = pair.split("=");
    if (k?.trim() === name) return v?.trim();
  }
  return undefined;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/auth/register/options", () => {
  it("returns 401 without bootstrap token when no credentials exist", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store);
    const res = await app.inject({ method: "POST", url: "/api/auth/register/options", payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 with wrong bootstrap token", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register/options",
      payload: { bootstrapToken: "wrong" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns registration options with correct bootstrap token (no creds)", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register/options",
      payload: { bootstrapToken: BOOTSTRAP },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().challenge).toBe(FAKE_CHALLENGE);
    // Must set a flowId cookie
    const flowId = extractCookie(res.headers as Record<string, string | string[]>, "flowId");
    expect(flowId).toBeTruthy();
  });

  it("requires a valid access token (not bootstrap) when credentials already exist", async () => {
    const store = makeFakeStore();
    // Pre-seed a passkey so count > 0.
    await store.saveCredential({ id: "existing", type: "passkey", publicKey: "pk", counter: 0 });
    const app = buildTestApp(store);

    // No token → 401
    const noAuth = await app.inject({
      method: "POST",
      url: "/api/auth/register/options",
      payload: { bootstrapToken: BOOTSTRAP },
    });
    expect(noAuth.statusCode).toBe(401);

    // Valid token → 200
    const token = await signAccessToken(KEY, { sub: "admin" });
    const ok = await app.inject({
      method: "POST",
      url: "/api/auth/register/options",
      payload: {},
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ok.statusCode).toBe(200);
  });
});

describe("POST /api/auth/register/verify", () => {
  it("stores credential and returns recovery codes (once)", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store);

    // Step 1: get options to populate the challenge in the store.
    const optRes = await app.inject({
      method: "POST",
      url: "/api/auth/register/options",
      payload: { bootstrapToken: BOOTSTRAP },
    });
    expect(optRes.statusCode).toBe(200);
    const flowId = extractCookie(optRes.headers as Record<string, string | string[]>, "flowId");
    expect(flowId).toBeTruthy();

    // Step 2: verify with the flowId cookie.
    const verRes = await app.inject({
      method: "POST",
      url: "/api/auth/register/verify",
      payload: { id: FAKE_CRED_ID, response: {} },
      cookies: { flowId: flowId! },
    });
    expect(verRes.statusCode).toBe(200);
    const body = verRes.json();
    expect(body.verified).toBe(true);
    expect(Array.isArray(body.recoveryCodes)).toBe(true);
    expect(body.recoveryCodes).toHaveLength(8);

    // The credential must be saved in the store.
    const stored = await store.getCredential(FAKE_CRED_ID);
    expect(stored?.id).toBe(FAKE_CRED_ID);
    expect(stored?.type).toBe("passkey");
    expect(stored?.publicKey).toBe(FAKE_PUBLIC_KEY_HEX);

    // Recovery codes must be stored (hashed).
    expect(store.recoveryCodes).toHaveLength(8);
  });

  it("returns 401 when flowId cookie is missing", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store);
    const res = await app.inject({ method: "POST", url: "/api/auth/register/verify", payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when challenge does not exist (already consumed)", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register/verify",
      payload: {},
      cookies: { flowId: "nonexistent-flow-id" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 when verification fails", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store, {
      doVerifyRegistration: fakeVerifyRegistrationFail,
    });

    // Seed the challenge directly.
    await store.saveChallenge("test-flow", FAKE_CHALLENGE, 60);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register/verify",
      payload: { id: FAKE_CRED_ID },
      cookies: { flowId: "test-flow" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/auth/login/options", () => {
  it("returns authentication options and sets a flowId cookie", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store);
    const res = await app.inject({ method: "POST", url: "/api/auth/login/options" });
    expect(res.statusCode).toBe(200);
    expect(res.json().challenge).toBe(FAKE_CHALLENGE);
    const flowId = extractCookie(res.headers as Record<string, string | string[]>, "flowId");
    expect(flowId).toBeTruthy();
  });
});

describe("POST /api/auth/login/verify", () => {
  it("issues an access token and sets a refresh cookie on success", async () => {
    const store = makeFakeStore();
    // Pre-seed a passkey credential.
    await store.saveCredential({
      id: FAKE_CRED_ID,
      type: "passkey",
      publicKey: FAKE_PUBLIC_KEY_HEX,
      counter: 0,
    });
    const app = buildTestApp(store);

    // Get login options to create a challenge.
    const optRes = await app.inject({ method: "POST", url: "/api/auth/login/options" });
    const flowId = extractCookie(optRes.headers as Record<string, string | string[]>, "flowId");
    expect(flowId).toBeTruthy();

    // Verify login.
    const verRes = await app.inject({
      method: "POST",
      url: "/api/auth/login/verify",
      payload: { id: FAKE_CRED_ID },
      cookies: { flowId: flowId! },
    });
    expect(verRes.statusCode).toBe(200);
    const body = verRes.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.expiresIn).toBe(900);

    // Must set a refreshToken cookie.
    const refreshToken = extractCookie(verRes.headers as Record<string, string | string[]>, "refreshToken");
    expect(refreshToken).toBeTruthy();

    // Counter must be updated in the store.
    const stored = await store.getCredential(FAKE_CRED_ID);
    expect(stored?.counter).toBe(1);
  });

  it("returns 401 when flowId cookie is missing", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login/verify",
      payload: { id: FAKE_CRED_ID },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when credential is not found", async () => {
    const store = makeFakeStore();
    await store.saveChallenge("flow-x", FAKE_CHALLENGE, 60);
    const app = buildTestApp(store);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login/verify",
      payload: { id: "unknown-id" },
      cookies: { flowId: "flow-x" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when authentication verification fails", async () => {
    const store = makeFakeStore();
    await store.saveCredential({
      id: FAKE_CRED_ID,
      type: "passkey",
      publicKey: FAKE_PUBLIC_KEY_HEX,
      counter: 0,
    });
    await store.saveChallenge("flow-y", FAKE_CHALLENGE, 60);
    const app = buildTestApp(store, {
      doVerifyAuthentication: fakeVerifyAuthenticationFail,
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login/verify",
      payload: { id: FAKE_CRED_ID },
      cookies: { flowId: "flow-y" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/auth/refresh", () => {
  it("issues a new access token from a valid refresh cookie", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store);

    const refreshToken = await signRefreshToken(KEY, { sub: "admin" });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      cookies: { refreshToken },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeTruthy();
    expect(res.json().expiresIn).toBe(900);
  });

  it("returns 401 when no refresh cookie is present", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store);
    const res = await app.inject({ method: "POST", url: "/api/auth/refresh" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for an invalid refresh token", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      cookies: { refreshToken: "not-a-valid-jwt" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when an access token is submitted instead of a refresh token (typ check)", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store);
    // Access token has typ="access" — must NOT be accepted by /refresh.
    const accessToken = await signAccessToken(KEY, { sub: "admin" });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      cookies: { refreshToken: accessToken },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("returns ok and clears the refresh cookie", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store);
    const res = await app.inject({ method: "POST", url: "/api/auth/logout" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    // The Set-Cookie header should clear the refreshToken cookie.
    const raw = res.headers["set-cookie"] as string | string[];
    const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const hasRefreshClear = cookies.some((c) => c.startsWith("refreshToken=;") || c.includes("refreshToken=;"));
    expect(hasRefreshClear).toBe(true);
  });
});

describe("POST /api/auth/recovery", () => {
  it("issues an access token for a valid recovery code", async () => {
    const store = makeFakeStore();
    // Store a raw code as the "hash" (fake consumeRecoveryCode compares directly).
    await store.saveRecoveryCodes(["valid-recovery-code"]);
    const app = buildTestApp(store);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/recovery",
      payload: { code: "valid-recovery-code" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeTruthy();
    expect(res.json().expiresIn).toBe(900);
  });

  it("returns 401 for an invalid recovery code", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/recovery",
      payload: { code: "wrong-code" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when code is missing from body", async () => {
    const store = makeFakeStore();
    const app = buildTestApp(store);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/recovery",
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects already-used recovery codes (single-use)", async () => {
    const store = makeFakeStore();
    await store.saveRecoveryCodes(["one-time-code"]);
    const app = buildTestApp(store);

    // First use: success.
    const first = await app.inject({
      method: "POST",
      url: "/api/auth/recovery",
      payload: { code: "one-time-code" },
    });
    expect(first.statusCode).toBe(200);

    // Second use: rejected.
    const second = await app.inject({
      method: "POST",
      url: "/api/auth/recovery",
      payload: { code: "one-time-code" },
    });
    expect(second.statusCode).toBe(401);
  });
});
