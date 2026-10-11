import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { log } from "../../lib/logger.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { ExtractionUnrecognizedError, type ExtractionProvider } from "../../extraction/types.js";
import type { PrivateFileStore } from "../../storage/types.js";
import { recordAudit } from "../audit/audit.js";
import { normalizeExtraction } from "./safetyGate.js";
import { getPrescription, type PrescriptionDto } from "./service.js";

interface Ctx {
  requestId: string;
}

/** A run stuck in "processing" longer than this (for example after a crash) may be started again. */
export const PROCESSING_STALE_MS = 5 * 60_000;
const EXTRACTION_TIMEOUT_MS = 30_000;

type FailureReason = "original_file_missing" | "unrecognized_input" | "provider_error" | "invalid_output";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("extraction timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Runs extraction for one prescription record the caller owns.
 *
 * - No provider configured: refuses with PROVIDER_DISABLED and changes nothing.
 * - Only `pending` or `failed` records start a run (or a stale `processing`
 *   one). A `completed` record is never silently re-processed, because a new
 *   version would supersede a later patient correction as "latest".
 * - The claim is one conditional update, so concurrent calls cannot both run.
 * - Output goes through the safety gate; the original file and earlier
 *   versions are never touched. A failed run creates no version and is audited.
 */
export async function processPrescription(
  deps: { db: Db; store: PrivateFileStore; provider: ExtractionProvider | null },
  auth: AuthContext,
  target: { prescriptionId: string; patientId: string },
  ctx: Ctx,
): Promise<PrescriptionDto> {
  const { db, store, provider } = deps;
  const { prescriptionId, patientId } = target;
  const audit = (action: string, outcome: "success" | "denied" | "failure", metadata: Record<string, string | number | string[]>) =>
    recordAudit(db, {
      action,
      outcome,
      actorUserId: auth.userId,
      patientId,
      resourceType: "prescription",
      resourceId: prescriptionId,
      requestId: ctx.requestId,
      metadata,
    });

  if (!provider) {
    await audit("prescription.process_refused", "denied", { reason: "provider_disabled" });
    throw new AppError("PROVIDER_DISABLED");
  }

  const claimed = await db.prescriptionRecord.updateMany({
    where: {
      id: prescriptionId,
      OR: [
        { processingStatus: { in: ["pending", "failed"] } },
        { processingStatus: "processing", updatedAt: { lt: new Date(Date.now() - PROCESSING_STALE_MS) } },
      ],
    },
    data: { processingStatus: "processing" },
  });
  if (claimed.count !== 1) throw new AppError("CONFLICT", "Prescription cannot be processed in its current state");

  const fail = async (reason: FailureReason): Promise<PrescriptionDto> => {
    await db.prescriptionRecord.updateMany({
      where: { id: prescriptionId, processingStatus: "processing" },
      data: { processingStatus: "failed" },
    });
    await audit("prescription.processing_failed", "failure", { provider: provider.name, reason });
    return getPrescription(db, prescriptionId);
  };

  const record = await db.prescriptionRecord.findUniqueOrThrow({
    where: { id: prescriptionId },
    select: { originalStorageKey: true, originalMimeType: true },
  });
  const bytes = await store.read(record.originalStorageKey);
  if (!bytes) return fail("original_file_missing");

  let raw: unknown;
  try {
    raw = await withTimeout(provider.extract({ bytes, mimeType: record.originalMimeType }), EXTRACTION_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof ExtractionUnrecognizedError) return fail("unrecognized_input");
    // Log only the error type; provider errors can echo document content.
    log("error", "extraction provider error", { requestId: ctx.requestId, errorName: err instanceof Error ? err.name : "unknown" });
    return fail("provider_error");
  }

  const gated = normalizeExtraction(raw);
  if (!gated.ok) return fail("invalid_output");
  const result = gated.value;

  await db.$transaction(async (tx) => {
    const latest = await tx.prescriptionVersion.aggregate({ where: { prescriptionId }, _max: { versionNumber: true } });
    const versionNumber = (latest._max.versionNumber ?? 0) + 1;

    await tx.prescriptionVersion.create({
      data: {
        prescriptionId,
        versionNumber,
        kind: "extraction",
        verificationStatus: result.verificationStatus,
        extractionProvider: provider.name,
        extractionConfidence: result.overallConfidence,
        prescriptionDate: result.prescriptionDate,
        prescriberName: result.prescriberName,
        changedFields: [],
        createdByUserId: null,
        medications: { create: result.medications.map((medication, position) => ({ position, ...medication })) },
      },
    });

    // Still our claim? If another call reclaimed a stale run, abandon this one.
    const completed = await tx.prescriptionRecord.updateMany({
      where: { id: prescriptionId, processingStatus: "processing" },
      data: { processingStatus: "completed" },
    });
    if (completed.count !== 1) throw new AppError("CONFLICT", "Prescription cannot be processed in its current state");

    await recordAudit(tx, {
      action: "prescription.processed",
      outcome: "success",
      actorUserId: auth.userId,
      patientId,
      resourceType: "prescription",
      resourceId: prescriptionId,
      requestId: ctx.requestId,
      // Provider, version, status, and reason CODES only. No medical content.
      metadata: {
        provider: provider.name,
        versionNumber,
        verificationStatus: result.verificationStatus,
        reviewReasons: result.reviewReasons,
      },
    });
  });

  return getPrescription(db, prescriptionId);
}
