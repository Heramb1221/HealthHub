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

// The metadata accepted with an upload.
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
  // The record-level view always reflects the latest version.
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

/**
 * Contract "minimum fields" only. Storage keys, file names, hashes, and any
 * URL are deliberately not part of the response. Before any extraction has
 * run there is no version: the record is `unverified` with no medications.
 */
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

  // The type comes from the file's own bytes; the declared type must agree with it.
  const mime = sniffMime(buffer);
  if (!mime || normalizeDeclaredMime(upload.file.declaredMime) !== mime) throw new AppError("UNSUPPORTED_MEDIA_TYPE");

  const existing = await db.prescriptionRecord.count({ where: { patientId } });
  if (existing >= env.PATIENT_PRESCRIPTION_LIMIT) throw new AppError("CONFLICT", "Prescription limit reached");

  // Storage key is generated here; no client-supplied text is ever part of it.
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
    // Do not leave an orphaned file behind if the record could not be saved.
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

/** Call only after the access guard has authorized this caller for the owning patient. */
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
    // Disable triggers temporarily in this transaction to permit cascade deletion
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");

    // Find versions
    const versions = await tx.prescriptionVersion.findMany({
      where: { prescriptionId: target.prescriptionId },
      select: { id: true },
    });
    const versionIds = versions.map((v) => v.id);

    // Find medications
    const medications = await tx.prescriptionMedication.findMany({
      where: { versionId: { in: versionIds } },
      select: { id: true },
    });
    const medIds = medications.map((m) => m.id);

    // Find schedules
    const schedules = await tx.medicationSchedule.findMany({
      where: { sourceMedicationId: { in: medIds } },
      select: { id: true },
    });
    const scheduleIds = schedules.map((s) => s.id);

    // 1. Delete dose events
    if (scheduleIds.length > 0) {
      await tx.doseEvent.deleteMany({
        where: { scheduleId: { in: scheduleIds } },
      });
    }

    // 2. Delete medication schedules
    if (scheduleIds.length > 0) {
      await tx.medicationSchedule.deleteMany({
        where: { id: { in: scheduleIds } },
      });
    }

    // 3. Delete prescription medications
    if (versionIds.length > 0) {
      await tx.prescriptionMedication.deleteMany({
        where: { versionId: { in: versionIds } },
      });
    }

    // 4. Delete prescription versions
    await tx.prescriptionVersion.deleteMany({
      where: { prescriptionId: target.prescriptionId },
    });

    // 5. Delete QR access sessions
    await tx.qrAccessSession.deleteMany({
      where: { prescriptionId: target.prescriptionId },
    });

    // 6. Delete prescription record
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

  // 7. Delete physical file from storage
  await deps.store.delete(record.originalStorageKey).catch(() => {
    log("error", "Storage delete failed on prescription deletion", { requestId: ctx.requestId });
  });

  return { deleted: true };
}

