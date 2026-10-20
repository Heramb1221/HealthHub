import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { authorizePatientData } from "../access/patientAccess.js";
import { recordAudit } from "../audit/audit.js";
import { getPrescription, type PrescriptionDto } from "../prescriptions/service.js";

interface Ctx {
  requestId: string;
}

const SELECT = { id: true, patientId: true, prescriptionId: true, expiresAt: true, revokedAt: true, createdAt: true } as const;

type SessionRow = { id: string; prescriptionId: string; expiresAt: Date; revokedAt: Date | null; createdAt: Date };

export interface QrSessionDto {
  id: string;
  prescriptionId: string;

  qrPayload: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

const toDto = (env: Pick<Env, "QR_LINK_BASE">, row: SessionRow): QrSessionDto => ({
  id: row.id,
  prescriptionId: row.prescriptionId,
  qrPayload: `${env.QR_LINK_BASE}qr/${row.id}`,
  expiresAt: row.expiresAt.toISOString(),
  revokedAt: row.revokedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

const isLive = (row: { revokedAt: Date | null; expiresAt: Date }): boolean => row.revokedAt === null && row.expiresAt.getTime() > Date.now();

export async function createQrSession(
  db: Db,
  env: Pick<Env, "QR_LINK_BASE" | "QR_SESSION_TTL_MINUTES">,
  auth: AuthContext,
  prescriptionId: string,
  ctx: Ctx,
): Promise<QrSessionDto> {
  const record = await db.prescriptionRecord.findUnique({ where: { id: prescriptionId }, select: { patientId: true } });
  if (!record) throw new AppError("NOT_FOUND");

  await authorizePatientData(db, auth, record.patientId, "prescriptions:read", {
    requestId: ctx.requestId,
    resourceType: "prescription",
    resourceId: prescriptionId,
  });

  const expiresAt = new Date(Date.now() + env.QR_SESSION_TTL_MINUTES * 60_000);
  const row = await db.$transaction(async (tx) => {
    const created = await tx.qrAccessSession.create({
      data: { patientId: record.patientId, prescriptionId, createdByUserId: auth.userId, expiresAt },
      select: SELECT,
    });
    await recordAudit(tx, {
      action: "qr.session_created",
      outcome: "success",
      actorUserId: auth.userId,
      patientId: record.patientId,
      resourceType: "qr_session",
      resourceId: created.id,
      requestId: ctx.requestId,
      metadata: { prescriptionId, ttlMinutes: env.QR_SESSION_TTL_MINUTES },
    });
    return created;
  });
  return toDto(env, row);
}

export async function getQrSession(
  db: Db,
  auth: AuthContext,
  sessionId: string,
  ctx: Ctx,
): Promise<{ session: { id: string; expiresAt: string }; prescription: PrescriptionDto }> {
  const row = await db.qrAccessSession.findUnique({ where: { id: sessionId }, select: SELECT });
  if (!row || !isLive(row)) throw new AppError("NOT_FOUND");

  await authorizePatientData(db, auth, row.patientId, "prescriptions:read", {
    requestId: ctx.requestId,
    resourceType: "qr_session",
    resourceId: sessionId,
  });

  const prescription = await getPrescription(db, row.prescriptionId);
  return { session: { id: row.id, expiresAt: row.expiresAt.toISOString() }, prescription };
}

export async function revokeQrSession(
  db: Db,
  env: Pick<Env, "QR_LINK_BASE">,
  auth: AuthContext,
  sessionId: string,
  ctx: Ctx,
): Promise<QrSessionDto> {
  const row = await db.qrAccessSession.findUnique({ where: { id: sessionId }, select: SELECT });
  if (!row) throw new AppError("NOT_FOUND");
  await authorizePatientData(db, auth, row.patientId, "prescriptions:read", {
    requestId: ctx.requestId,
    resourceType: "qr_session",
    resourceId: sessionId,
  });
  if (row.revokedAt) return toDto(env, row);

  const revoked = await db.$transaction(async (tx) => {
    const updated = await tx.qrAccessSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() }, select: SELECT });
    await recordAudit(tx, {
      action: "qr.session_revoked",
      outcome: "success",
      actorUserId: auth.userId,
      patientId: row.patientId,
      resourceType: "qr_session",
      resourceId: sessionId,
      requestId: ctx.requestId,
    });
    return updated;
  });
  return toDto(env, revoked);
}
