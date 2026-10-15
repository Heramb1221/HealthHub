import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Env } from "../config/env.js";
import type { Db } from "../db/client.js";
import type { UserRole } from "../generated/prisma/client.js";
import { AppError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/auth/tokens.js";
import { uuidSchema } from "../lib/validate.js";

export interface AuthContext {
  userId: string;
  /** Always read from the database for this request, never from the token. */
  role: UserRole;
  sessionId: string;
}

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
  }
}

const BEARER = /^Bearer ([A-Za-z0-9\-_.]+)$/;

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  const bearerToken = header ? BEARER.exec(header)?.[1] : undefined;
  if (bearerToken) return bearerToken;

  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    const cookie = cookies.find((c) => c.startsWith("hh_session="));
    if (cookie) return decodeURIComponent(cookie.slice("hh_session=".length));
  }
  return undefined;
}

/**
 * Requires a valid bearer token whose session exists, is not revoked or
 * expired, and whose user is still active. Every failure is the same generic
 * UNAUTHENTICATED so a caller cannot tell why a token was rejected.
 */
export function authenticate(db: Db, env: Pick<Env, "JWT_SECRET">): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) throw new AppError("UNAUTHENTICATED");

    const claims = await verifyAccessToken(env.JWT_SECRET, token);
    if (!claims || !uuidSchema.safeParse(claims.sessionId).success) throw new AppError("UNAUTHENTICATED");

    const session = await db.session.findUnique({
      where: { id: claims.sessionId },
      select: { userId: true, expiresAt: true, revokedAt: true, user: { select: { role: true, isActive: true } } },
    });
    if (
      !session ||
      session.userId !== claims.userId ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.user.isActive
    ) {
      throw new AppError("UNAUTHENTICATED");
    }

    req.auth = { userId: session.userId, role: session.user.role, sessionId: claims.sessionId };
    next();
  };
}

/** For handlers: returns the auth context or throws if `authenticate` did not run. */
export function requireAuth(req: Request): AuthContext {
  if (!req.auth) throw new AppError("UNAUTHENTICATED");
  return req.auth;
}

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    const auth = requireAuth(req);
    if (!roles.includes(auth.role)) throw new AppError("FORBIDDEN");
    next();
  };
}
