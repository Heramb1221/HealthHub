import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import type { UserRole } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { log } from "../../lib/logger.js";
import { hashPassword, verifyPassword } from "../../lib/auth/password.js";
import { signAccessToken } from "../../lib/auth/tokens.js";
import { recordAudit } from "../audit/audit.js";
import { generateHealthId } from "../patients/healthId.js";

export interface AuthResult {
  user: { id: string; email: string; role: UserRole };
  accessToken: string;
  expiresAt: string;
}

interface Ctx {
  requestId: string;
}

/** Demo accounts only; the development-only login refuses every other address. */
export const DEMO_EMAIL_DOMAIN = "@demo.healthhub.test";

const MAX_HEALTH_ID_ATTEMPTS = 5;

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

async function issueSession(db: Db, env: Env, user: { id: string; email: string; role: UserRole }): Promise<AuthResult> {
  const expiresAt = new Date(Date.now() + env.ACCESS_TOKEN_TTL_MINUTES * 60_000);
  const session = await db.session.create({ data: { userId: user.id, expiresAt }, select: { id: true } });
  const accessToken = await signAccessToken(env.JWT_SECRET, { userId: user.id, sessionId: session.id }, expiresAt);
  return { user, accessToken, expiresAt: expiresAt.toISOString() };
}

/** Registration always creates a patient user plus its patient row. The role is never client-supplied. */
export async function register(db: Db, env: Env, input: { email: string; password: string }, ctx: Ctx): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);

  for (let attempt = 0; attempt < MAX_HEALTH_ID_ATTEMPTS; attempt += 1) {
    try {
      const user = await db.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email: input.email, passwordHash, role: "patient" },
          select: { id: true, email: true, role: true },
        });
        const patient = await tx.patient.create({
          data: { userId: created.id, healthId: generateHealthId() },
          select: { id: true },
        });
        await recordAudit(tx, {
          action: "auth.register",
          outcome: "success",
          actorUserId: created.id,
          patientId: patient.id,
          requestId: ctx.requestId,
        });
        return created;
      });
      return await issueSession(db, env, user);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Either the email is taken or the generated health ID collided; tell them apart.
      const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
      if (existing) throw new AppError("CONFLICT", "Unable to register with these details");
      // Health ID collision: loop and generate another.
    }
  }
  throw new AppError("INTERNAL_ERROR");
}

export async function login(db: Db, env: Env, input: { email: string; password: string }, ctx: Ctx): Promise<AuthResult> {
  const user = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, role: true, isActive: true, passwordHash: true },
  });

  // Always run a full password verification, even for unknown emails.
  const passwordOk = await verifyPassword(user?.passwordHash ?? null, input.password);

  if (!user || !passwordOk || !user.isActive) {
    try {
      await recordAudit(db, {
        action: "auth.login",
        outcome: "denied",
        actorUserId: user?.id ?? null,
        requestId: ctx.requestId,
      });
    } catch {
      log("error", "audit write failed", { requestId: ctx.requestId, action: "auth.login" });
    }
    // Identical for wrong email, wrong password, and deactivated account.
    throw new AppError("UNAUTHENTICATED", "Invalid email or password");
  }

  const result = await issueSession(db, env, { id: user.id, email: user.email, role: user.role });
  await recordAudit(db, { action: "auth.login", outcome: "success", actorUserId: user.id, requestId: ctx.requestId });
  return result;
}

/** DEVELOPMENT ONLY. Logs in a seeded demo account without a password. Route is mounted only when DEV_AUTH_ENABLED=true. */
export async function devLogin(db: Db, env: Env, input: { email: string }, ctx: Ctx): Promise<AuthResult> {
  const user = input.email.endsWith(DEMO_EMAIL_DOMAIN)
    ? await db.user.findUnique({ where: { email: input.email }, select: { id: true, email: true, role: true, isActive: true } })
    : null;
  if (!user || !user.isActive) throw new AppError("UNAUTHENTICATED", "Invalid email or password");

  const result = await issueSession(db, env, { id: user.id, email: user.email, role: user.role });
  await recordAudit(db, {
    action: "auth.dev_login",
    outcome: "success",
    actorUserId: user.id,
    requestId: ctx.requestId,
    metadata: { devOnly: true },
  });
  return result;
}

export async function logout(db: Db, auth: { userId: string; sessionId: string }, ctx: Ctx): Promise<void> {
  await db.session.updateMany({ where: { id: auth.sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  await recordAudit(db, { action: "auth.logout", outcome: "success", actorUserId: auth.userId, requestId: ctx.requestId });
}
