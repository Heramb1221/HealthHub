import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { log } from "../../lib/logger.js";
import { parse } from "../../lib/validate.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import type { PrivateFileStore } from "../../storage/types.js";
import { recordAudit } from "../audit/audit.js";
import { ownPatientId } from "../patients/ownPatient.js";
import { normalizeDeclaredMime, sanitizeFileName, sniffMime } from "./fileValidation.js";
import type { ParsedUpload } from "./upload.js";

interface Ctx {
  requestId: string;
}

const uploadFieldsSchema = z.strictObject({
  sourceType: z.literal("uploaded_physical").optional(),
  prescriptionDate: z.string().optional(),
  prescriberName: z.string().optional(),
});

export const PRESCRIPTION_SELECT = {
  id: true,
  patientId: true,
  sourceType: true,
  processingStatus: true,
  createdAt: true,
  updatedAt: true,

  versions: {
    orderBy: { versionNumber: "desc" },
    take: 1,
    select: {
      verificationStatus: true,
      prescriptionDate: true,
      prescriberName: true,
      medications: {
        orderBy: { position: "asc" },
        select: { name: true, strength: true, dose: true, route: true, frequency: true, duration: true, instructions: true, confidence: true },
      },
    },
  },
} as const;

type PrescriptionRow = {
  id: string;
  patientId: string;
  sourceType: string;
  processingStatus: string;
  createdAt: Date;
  updatedAt: Date;
  versions: Array<{
    verificationStatus: string;
    prescriptionDate: Date | null;
    prescriberName: string | null;
    medications: Array<{
      name: string | null;
      strength: string | null;
      dose: string | null;
      route: string | null;
      frequency: string | null;
      duration: string | null;
      instructions: string | null;
      confidence: number;
    }>;
  }>;
};

export interface PrescriptionDto {
  id: string;
  patientId: string;
  sourceType: string;
  processingStatus: string;
  verificationStatus: string;
  prescriptionDate: string | null;
  prescriberName: string | null;
  medications: PrescriptionRow["versions"][number]["medications"];
  createdAt: string;
  updatedAt: string;
}

export function toPrescriptionDto(row: PrescriptionRow): PrescriptionDto {
  const latest = row.versions[0];
  return {
    id: row.id,
    patientId: row.patientId,
    sourceType: row.sourceType,
    processingStatus: row.processingStatus,
    verificationStatus: latest?.verificationStatus ?? "unverified",
    prescriptionDate: latest?.prescriptionDate ? latest.prescriptionDate.toISOString().slice(0, 10) : null,
    prescriberName: latest?.prescriberName ?? null,
    medications: latest?.medications ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createPrescription(
  deps: { db: Db; store: PrivateFileStore; env: Env },
  auth: AuthContext,
  upload: ParsedUpload,
  ctx: Ctx,
): Promise<PrescriptionDto> {
  const { db, store, env } = deps;
  const patientId = await ownPatientId(db, auth);
  parse(uploadFieldsSchema, upload.fields);

  const { buffer } = upload.file;
  if (buffer.length === 0) throw new AppError("VALIDATION_ERROR");

  const mime = sniffMime(buffer);
  if (!mime || normalizeDeclaredMime(upload.file.declaredMime) !== mime) throw new AppError("UNSUPPORTED_MEDIA_TYPE");

  const existing = await db.prescriptionRecord.count({ where: { patientId } });
  if (existing >= env.PATIENT_PRESCRIPTION_LIMIT) throw new AppError("CONFLICT", "Prescription limit reached");

  const storageKey = `prescriptions/${patientId}/${randomUUID()}`;
  await store.put(storageKey, buffer);

  try {
    const row = await db.$transaction(async (tx) => {
      const created = await tx.prescriptionRecord.create({
        data: {
          patientId,
          sourceType: "uploaded_physical",
          processingStatus: "pending",
          originalStorageKey: storageKey,
          originalFileName: sanitizeFileName(upload.file.filename),
          originalMimeType: mime,
          originalSizeBytes: buffer.length,
          originalSha256: createHash("sha256").update(buffer).digest("hex"),
        },
        select: PRESCRIPTION_SELECT,
      });
      await recordAudit(tx, {
        action: "prescription.uploaded",
        outcome: "success",
        actorUserId: auth.userId,
        patientId,
        resourceType: "prescription",
        resourceId: created.id,
        requestId: ctx.requestId,
        metadata: { mimeType: mime, sizeBytes: buffer.length },
      });
      return created;
    });
    return toPrescriptionDto(row);
  } catch (err) {

    await store.delete(storageKey).catch(() => {
      log("error", "orphan cleanup failed", { requestId: ctx.requestId });
    });
    throw err;
  }
}

export async function listPrescriptions(
  db: Db,
  auth: AuthContext,
  query: { limit: number; cursor?: string | undefined },
): Promise<{ data: PrescriptionDto[]; page: { limit: number; nextCursor: string | null } }> {
  const patientId = await ownPatientId(db, auth);
  const rows = await db.prescriptionRecord.findMany({
    where: { patientId },
    select: PRESCRIPTION_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return {
    data: items.map(toPrescriptionDto),
    page: { limit: query.limit, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null },
  };
}

export async function getPrescription(db: Db, prescriptionId: string): Promise<PrescriptionDto> {
  const row = await db.prescriptionRecord.findUnique({ where: { id: prescriptionId }, select: PRESCRIPTION_SELECT });
  if (!row) throw new AppError("NOT_FOUND");
  return toPrescriptionDto(row);
}

export async function deletePrescription(
  deps: { db: Db; store: PrivateFileStore },
  auth: AuthContext,
  target: { prescriptionId: string; patientId: string },
  ctx: Ctx,
): Promise<{ deleted: boolean }> {
  const patientId = await ownPatientId(deps.db, auth);
  if (patientId !== target.patientId) {
    throw new AppError("FORBIDDEN", "You can only delete your own prescriptions");
  }

  const record = await deps.db.prescriptionRecord.findUnique({
    where: { id: target.prescriptionId },
    select: { id: true, patientId: true, originalStorageKey: true },
  });

  if (!record || record.patientId !== patientId) {
    throw new AppError("NOT_FOUND", "Prescription not found");
  }

  await deps.db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL healthhub.allow_prescription_deletion = 'on'");

    const versions = await tx.prescriptionVersion.findMany({
      where: { prescriptionId: target.prescriptionId },
      select: { id: true },
    });
    const versionIds = versions.map((v) => v.id);

    const medications = await tx.prescriptionMedication.findMany({
      where: { versionId: { in: versionIds } },
      select: { id: true },
    });
    const medIds = medications.map((m) => m.id);

    const schedules = await tx.medicationSchedule.findMany({
      where: { sourceMedicationId: { in: medIds } },
      select: { id: true },
    });
    const scheduleIds = schedules.map((s) => s.id);

    if (scheduleIds.length > 0) {
      await tx.doseEvent.deleteMany({
        where: { scheduleId: { in: scheduleIds } },
      });
    }

    if (scheduleIds.length > 0) {
      await tx.medicationSchedule.deleteMany({
        where: { id: { in: scheduleIds } },
      });
    }

    if (versionIds.length > 0) {
      await tx.prescriptionMedication.deleteMany({
        where: { versionId: { in: versionIds } },
      });
    }

    await tx.prescriptionVersion.deleteMany({
      where: { prescriptionId: target.prescriptionId },
    });

    await tx.qrAccessSession.deleteMany({
      where: { prescriptionId: target.prescriptionId },
    });

    await tx.prescriptionRecord.delete({
      where: { id: target.prescriptionId },
    });

    await recordAudit(tx, {
      action: "prescription.delete",
      outcome: "success",
      actorUserId: auth.userId,
      patientId,
      resourceType: "prescription",
      resourceId: target.prescriptionId,
      requestId: ctx.requestId,
      metadata: { storageKey: record.originalStorageKey },
    });
  });

  await deps.store.delete(record.originalStorageKey).catch(() => {
    log("error", "Storage delete failed on prescription deletion", { requestId: ctx.requestId });
  });

  return { deleted: true };
}
