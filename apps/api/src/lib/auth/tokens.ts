import { jwtVerify, SignJWT } from "jose";

export interface TokenClaims {
  userId: string;
  sessionId: string;
}

const ALG = "HS256";

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Access token carrying only the user id (sub) and session id (jti). The role
 * is deliberately NOT a claim: it is always read from the database.
 */
export async function signAccessToken(secret: string, claims: TokenClaims, expiresAt: Date): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.userId)
    .setJti(claims.sessionId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key(secret));
}

/** Returns the claims, or null for any invalid, expired, or malformed token. */
export async function verifyAccessToken(secret: string, token: string): Promise<TokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: [ALG], requiredClaims: ["sub", "jti", "exp"] });
    if (typeof payload.sub !== "string" || typeof payload.jti !== "string") return null;
    return { userId: payload.sub, sessionId: payload.jti };
  } catch {
    return null;
  }
}
