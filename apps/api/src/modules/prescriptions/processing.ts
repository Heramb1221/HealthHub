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

export const PROCESSING_STALE_MS = 5 * 60_000;
const EXTRACTION_TIMEOUT_MS = 60_000;

class PatientEntriesExistError extends AppError {
  constructor() {
    super("CONFLICT", "This prescription already has patient-entered data");
  }
}

type FailureReason = "original_file_missing" | "unrecognized_input" | "provider_error" | "invalid_output";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("extraction timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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

  const patientEntries = await db.prescriptionVersion.count({ where: { prescriptionId, kind: "patient_correction" } });
  if (patientEntries > 0) throw new PatientEntriesExistError();

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
  let usedProvider = provider.name;
  try {
    const input = { bytes, mimeType: record.originalMimeType };
    if (provider.extractWithProvenance) {
      const detailed = await withTimeout(provider.extractWithProvenance(input), EXTRACTION_TIMEOUT_MS);
      raw = detailed.raw;
      usedProvider = detailed.provider;
    } else {
      raw = await withTimeout(provider.extract(input), EXTRACTION_TIMEOUT_MS);
    }
  } catch (err) {
    if (err instanceof ExtractionUnrecognizedError) return fail("unrecognized_input");

    const message = err instanceof Error ? err.message.replace(/([a-zA-Z0-9_-]{20,})/g, "[redacted]") : "unknown";
    log("error", "extraction provider error", { requestId: ctx.requestId, errorName: err instanceof Error ? err.name : "unknown", errorDetails: message.slice(0, 300) });
    return fail("provider_error");
  }

  const gated = normalizeExtraction(raw);
  if (!gated.ok) return fail("invalid_output");
  const result = gated.value;

  try {
    await db.$transaction(async (tx) => {

      await tx.$queryRaw`SELECT "id" FROM "PrescriptionRecord" WHERE "id" = ${prescriptionId}::uuid FOR UPDATE`;
      const patientEntriesNow = await tx.prescriptionVersion.count({ where: { prescriptionId, kind: "patient_correction" } });
      if (patientEntriesNow > 0) throw new PatientEntriesExistError();

      const latest = await tx.prescriptionVersion.aggregate({ where: { prescriptionId }, _max: { versionNumber: true } });
      const versionNumber = (latest._max.versionNumber ?? 0) + 1;

      await tx.prescriptionVersion.create({
        data: {
          prescriptionId,
          versionNumber,
          kind: "extraction",
          verificationStatus: result.verificationStatus,
          extractionProvider: usedProvider,
          extractionConfidence: result.overallConfidence,
          prescriptionDate: result.prescriptionDate,
          prescriberName: result.prescriberName,
          changedFields: [],
          createdByUserId: null,
          medications: { create: result.medications.map((medication, position) => ({ position, ...medication })) },
        },
      });

      // Deliberately NOT done here: creating medication schedules or history entries from the raw
      // reading. Automatic extraction is unverified, so it must never turn into reminders (or into
      // a health-history "fact") before the patient has reviewed and confirmed the details. Schedules
      // are created later, through the gated schedules endpoint, from confirmed rows only.

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

        metadata: {
          provider: usedProvider,
          versionNumber,
          verificationStatus: result.verificationStatus,
          reviewReasons: result.reviewReasons,
        },
      });
    });
  } catch (err) {

    if (err instanceof PatientEntriesExistError) {
      await db.prescriptionRecord.updateMany({
        where: { id: prescriptionId, processingStatus: "processing" },
        data: { processingStatus: "failed" },
      });
    }
    throw err;
  }

  return getPrescription(db, prescriptionId);
}
