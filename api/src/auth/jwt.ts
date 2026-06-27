import { SignJWT, jwtVerify } from "jose";

const ISSUER = "bio";
const AUDIENCE = "bio-admin";

function secret(key: string): Uint8Array {
  return new TextEncoder().encode(key);
}

export interface Principal {
  sub: string; // "admin" | "mcp"
}

async function sign(key: string, principal: Principal, typ: "access" | "refresh", exp: string) {
  return new SignJWT({ typ })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(principal.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secret(key));
}

export const signAccessToken = (key: string, p: Principal, exp = "15m") => sign(key, p, "access", exp);
export const signRefreshToken = (key: string, p: Principal, exp = "30d") => sign(key, p, "refresh", exp);

export interface Claims {
  sub: string;
  typ: "access" | "refresh";
}

export async function verifyToken(key: string, token: string): Promise<Claims> {
  const { payload } = await jwtVerify(token, secret(key), {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ["HS256"], // pin the algorithm explicitly (defence in depth)
  });
  const typ = payload.typ;
  if (typ !== "access" && typ !== "refresh") {
    throw new Error("JWT missing or invalid typ claim");
  }
  return { sub: String(payload.sub), typ };
}
