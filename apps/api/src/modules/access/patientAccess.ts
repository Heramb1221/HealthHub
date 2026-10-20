import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Db } from "../../db/client.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { AppError } from "../../lib/errors.js";
import { recordAudit } from "../audit/audit.js";
import type { ConsentScope } from "../consents/schemas.js";

export type AccessDecision =
  | { kind: "self"; patientId: string }
  | { kind: "consent"; patientId: string; consentId: string };

declare module "express-serve-static-core" {
  interface Request {
    access?: AccessDecision;
  }
}

interface Ctx {
  requestId: string;
  resourceType: string;
  resourceId?: string;
}

export async function authorizePatientData(
  db: Db,
  auth: AuthContext,
  patientId: string,
  scope: ConsentScope,
  ctx: Ctx,
): Promise<AccessDecision> {
  const audit = (outcome: "success" | "denied", metadata: Record<string, string>) =>
    recordAudit(db, {
      action: outcome === "success" ? "access.granted" : "access.denied",
      outcome,
      actorUserId: auth.userId,
      patientId,
      resourceType: ctx.resourceType,
      ...(ctx.resourceId ? { resourceId: ctx.resourceId } : {}),
      requestId: ctx.requestId,
      metadata: { resourceScope: scope, ...metadata },
    });

  if (auth.role === "patient") {
    const own = await db.patient.findUnique({ where: { userId: auth.userId }, select: { id: true } });
    if (own && own.id === patientId) return { kind: "self", patientId };
    await audit("denied", { reason: "not_owner" });
    throw new AppError("FORBIDDEN");
  }

  if (auth.role === "provider") {
    const now = new Date();
    const consent = await db.consent.findFirst({
      where: {
        patientId,
        granteeUserId: auth.userId,
        resourceScope: scope,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (consent) {
      await audit("success", { consentId: consent.id });
      return { kind: "consent", patientId, consentId: consent.id };
    }
    await audit("denied", { reason: "no_active_consent" });
    throw new AppError("FORBIDDEN");
  }

  await audit("denied", { reason: "role_not_permitted" });
  throw new AppError("FORBIDDEN");
}

export function requirePatientAccess(
  db: Db,
  options: {
    scope: ConsentScope;
    resourceType: string;
    getPatientId: (req: Request) => Promise<string | null>;
    getResourceId?: (req: Request) => string | undefined;
  },
): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const auth = requireAuth(req);
    const patientId = await options.getPatientId(req);
    if (!patientId) throw new AppError("NOT_FOUND");
    const resourceId = options.getResourceId?.(req);
    req.access = await authorizePatientData(db, auth, patientId, options.scope, {
      requestId: req.requestId,
      resourceType: options.resourceType,
      ...(resourceId ? { resourceId } : {}),
    });
    next();
  };
}
