import type { NextFunction, Request, RequestHandler, Response } from "express";
import { verifyToken, createClerkClient } from "@clerk/express";
import type { Env } from "../config/env.js";
import type { Db } from "../db/client.js";
import type { UserRole } from "../generated/prisma/client.js";
import { AppError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/auth/tokens.js";
import { generateHealthId } from "../modules/patients/healthId.js";
import { uuidSchema } from "../lib/validate.js";
import { log } from "../lib/logger.js";

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
    const clerkCookie = cookies.find((c) => c.startsWith("__session="));
    if (clerkCookie) return decodeURIComponent(clerkCookie.slice("__session=".length));
    const cookie = cookies.find((c) => c.startsWith("hh_session="));
    if (cookie) return decodeURIComponent(cookie.slice("hh_session=".length));
  }
  return undefined;
}


/**
 * Requires a valid bearer token whose session exists, is not revoked or
 * expired, and whose user is still active.
 * Supports both Clerk session tokens and internal HMAC JWT tokens.
 */
export function authenticate(db: Db, env: Pick<Env, "JWT_SECRET" | "CLERK_SECRET_KEY">): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) throw new AppError("UNAUTHENTICATED");

    // 1. Try Clerk Token verification if CLERK_SECRET_KEY is configured
    if (env.CLERK_SECRET_KEY) {
      let isClerk = false;
      try {
        const clerkClaims = await verifyToken(token, {
          secretKey: env.CLERK_SECRET_KEY,
        });

        if (clerkClaims && clerkClaims.sub) {
          isClerk = true;
          let user = null;
          try {
            user = await db.user.findUnique({
              where: { clerkUserId: clerkClaims.sub },
              select: { id: true, role: true, isActive: true },
            });
          } catch (dbErr) {
            log("error", "Database error querying user", { error: (dbErr as Error).message });
          }

          if (!user) {
            try {
              const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
              const clerkUser = await clerk.users.getUser(clerkClaims.sub);
              const primaryEmail =
                clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
                clerkUser.emailAddresses[0]?.emailAddress ??
                `${clerkClaims.sub}@clerk.user`;
              const normalizedEmail = primaryEmail.toLowerCase();
              const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;

              const existingByEmail = await db.user.findUnique({
                where: { email: normalizedEmail },
                select: { id: true, role: true, isActive: true },
              });

              if (existingByEmail) {
                user = await db.user.update({
                  where: { id: existingByEmail.id },
                  data: { clerkUserId: clerkClaims.sub },
                  select: { id: true, role: true, isActive: true },
                });
              } else {
                user = await db.$transaction(async (tx) => {
                  const created = await tx.user.create({
                    data: {
                      email: normalizedEmail,
                      clerkUserId: clerkClaims.sub,
                      role: "patient",
                      passwordHash: null,
                    },
                    select: { id: true, role: true, isActive: true },
                  });
                  await tx.patient.create({
                    data: {
                      userId: created.id,
                      healthId: generateHealthId(),
                      fullName,
                    },
                  });
                  return created;
                });
              }
            } catch (syncErr) {
              log("error", "Error syncing Clerk user with DB", { error: (syncErr as Error).message });
            }
          }

          if (user && user.isActive) {
            req.auth = {
              userId: user.id,
              role: user.role,
              sessionId: (clerkClaims.sid as string) ?? clerkClaims.sub,
            };
            next();
            return;
          }

          if (isClerk && !user) {
            // Token is valid Clerk user, but DB is unreachable or user could not be provisioned
            throw new AppError("UNAUTHENTICATED", "User record could not be loaded from database. Verify database connection.");
          }
        }
      } catch (clerkErr) {
        if (isClerk) throw clerkErr;
        // Not a Clerk token; fall through to local JWT check
      }
    }

    // 2. Fallback to local JWT token verification
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
