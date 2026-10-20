import type { Db } from "../../db/client.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { AppError } from "../../lib/errors.js";
import { recordAudit } from "../audit/audit.js";
import { ownPatientId } from "../patients/ownPatient.js";
import type { ConsentScope } from "./schemas.js";

interface Ctx {
  requestId: string;
}

interface ConsentRow {
  id: string;
  patientId: string;
  granteeUserId: string;
  resourceScope: string;
  purpose: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface ConsentDto {
  id: string;
  patientId: string;
  granteeUserId: string;
  resourceScope: string;
  purpose: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

function toDto(row: ConsentRow): ConsentDto {
  return {
    id: row.id,
    patientId: row.patientId,
    granteeUserId: row.granteeUserId,
    resourceScope: row.resourceScope,
    purpose: row.purpose,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const SELECT = {
  id: true,
  patientId: true,
  granteeUserId: true,
  resourceScope: true,
  purpose: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

export async function createConsent(
  db: Db,
  auth: AuthContext,
  input: { granteeUserId: string; resourceScope: ConsentScope; purpose: string; expiresAt?: Date | undefined },
  ctx: Ctx,
): Promise<ConsentDto> {
  const patientId = await ownPatientId(db, auth);

  if (input.granteeUserId === auth.userId) throw new AppError("VALIDATION_ERROR");
  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) throw new AppError("VALIDATION_ERROR");

  const grantee = await db.user.findFirst({
    where: { id: input.granteeUserId, role: "provider", isActive: true },
    select: { id: true },
  });
  if (!grantee) throw new AppError("NOT_FOUND", "Grantee not found");

  const created = await db.$transaction(async (tx) => {
    const row = await tx.consent.create({
      data: {
        patientId,
        granteeUserId: grantee.id,
        resourceScope: input.resourceScope,
        purpose: input.purpose,
        expiresAt: input.expiresAt ?? null,
      },
      select: SELECT,
    });
    await recordAudit(tx, {
      action: "consent.created",
      outcome: "success",
      actorUserId: auth.userId,
      patientId,
      resourceType: "consent",
      resourceId: row.id,
      requestId: ctx.requestId,

      metadata: { resourceScope: row.resourceScope, granteeUserId: row.granteeUserId },
    });
    return row;
  });
  return toDto(created);
}

export async function listConsents(
  db: Db,
  auth: AuthContext,
  query: { limit: number; cursor?: string | undefined },
): Promise<{ data: ConsentDto[]; page: { limit: number; nextCursor: string | null } }> {
  let where;
  if (auth.role === "patient") {
    where = { patientId: await ownPatientId(db, auth) };
  } else if (auth.role === "provider") {

    where = { granteeUserId: auth.userId };
  } else {
    throw new AppError("FORBIDDEN");
  }

  const rows = await db.consent.findMany({
    where,
    select: SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return {
    data: items.map(toDto),
    page: { limit: query.limit, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null },
  };
}

export async function revokeConsent(db: Db, auth: AuthContext, consentId: string, ctx: Ctx): Promise<ConsentDto> {
  const patientId = await ownPatientId(db, auth);

  const target = await db.consent.findFirst({ where: { id: consentId, patientId }, select: SELECT });
  if (!target) throw new AppError("NOT_FOUND");
  if (target.revokedAt) return toDto(target);

  const revoked = await db.$transaction(async (tx) => {
    const now = new Date();
    await tx.consent.updateMany({
      where: { patientId, granteeUserId: target.granteeUserId, resourceScope: target.resourceScope, revokedAt: null },
      data: { revokedAt: now },
    });
    await recordAudit(tx, {
      action: "consent.revoked",
      outcome: "success",
      actorUserId: auth.userId,
      patientId,
      resourceType: "consent",
      resourceId: target.id,
      requestId: ctx.requestId,
      metadata: { resourceScope: target.resourceScope, granteeUserId: target.granteeUserId },
    });
    return tx.consent.findUniqueOrThrow({ where: { id: target.id }, select: SELECT });
  });
  return toDto(revoked);
}
