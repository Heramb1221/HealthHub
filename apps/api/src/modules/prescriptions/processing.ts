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
const EXTRACTION_TIMEOUT_MS = 60_000;

/** Raised when patient-entered data appears while a run is in flight; the run must release its claim. */
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

export function inferReminderTimes(frequency: string | null | undefined): string[] {
  if (!frequency) return ["08:00"];
  const f = frequency.toLowerCase().trim();

  // 1-1-1-1 or four times
  if (f.includes("1-1-1-1") || f.includes("four times") || f.includes("qds") || f.includes("qid")) {
    return ["08:00", "12:00", "16:00", "20:00"];
  }

  // 1-1-1 or thrice or TDS or TID
  if (f.includes("1-1-1") || f.includes("three times") || f.includes("thrice") || f.includes("tds") || f.includes("tid")) {
    return ["08:00", "14:00", "20:00"];
  }

  // 1-0-1 or twice or BD or BID
  if (f.includes("1-0-1") || f.includes("0-1-1") || f.includes("twice") || f.includes("bd") || f.includes("bid")) {
    return ["08:00", "20:00"];
  }

  // Afternoon only (0-1-0)
  if (f.includes("0-1-0") || f.includes("afternoon")) {
    return ["14:00"];
  }

  // Night only (0-0-1 or bedtime or hs)
  if (f.includes("0-0-1") || f.includes("night") || f.includes("bedtime") || f.includes("hs") || f.includes("at bed")) {
    return ["20:00"];
  }

  // Morning only (1-0-0 or morning or OD or once)
  if (f.includes("1-0-0") || f.includes("morning") || f.includes("od") || f.includes("once")) {
    return ["08:00"];
  }

  return ["08:00"];
}

function parseDurationDays(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const match = duration.match(/(\d+)\s*(day|days|week|weeks|month|months)/i);
  if (!match || !match[1] || !match[2]) return null;
  const count = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("day")) return count;
  if (unit.startsWith("week")) return count * 7;
  if (unit.startsWith("month")) return count * 30;
  return null;
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

  // Automatic extraction would become the "latest" version and bury what the patient entered.
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

  try {
    await db.$transaction(async (tx) => {
      // Same lock corrections take, so the two can never interleave on one record.
      await tx.$queryRaw`SELECT "id" FROM "PrescriptionRecord" WHERE "id" = ${prescriptionId}::uuid FOR UPDATE`;
      const patientEntriesNow = await tx.prescriptionVersion.count({ where: { prescriptionId, kind: "patient_correction" } });
      if (patientEntriesNow > 0) throw new PatientEntriesExistError();

      const latest = await tx.prescriptionVersion.aggregate({ where: { prescriptionId }, _max: { versionNumber: true } });
      const versionNumber = (latest._max.versionNumber ?? 0) + 1;

      const createdVersion = await tx.prescriptionVersion.create({
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
        include: { medications: true },
      });

      // Automatically create MedicationSchedule for each read medication
      const today = new Date();
      for (const med of createdVersion.medications) {
        if (!med.name) continue;
        const reminderTimes = inferReminderTimes(med.frequency);
        const days = parseDurationDays(med.duration);
        const endDate = days ? new Date(today.getTime() + days * 86_400_000) : null;

        const existing = await tx.medicationSchedule.findFirst({
          where: {
            patientId,
            isActive: true,
            medicationName: { equals: med.name, mode: "insensitive" },
          },
          select: { id: true },
        });

        if (!existing) {
          await tx.medicationSchedule.create({
            data: {
              patientId,
              sourceMedicationId: med.id,
              medicationName: med.name,
              strength: med.strength ?? "",
              dose: med.dose ?? "1 dose",
              route: med.route,
              frequency: med.frequency ?? "As prescribed",
              duration: med.duration,
              instructions: med.instructions,
              startDate: today,
              endDate,
              reminderTimes,
              remindersEnabled: true,
              timezone: "Asia/Kolkata",
              isActive: true,
            },
          });
        }
      }

      // Automatically record in Medical History section
      const doctorTitle = result.prescriberName
        ? `Prescription: Dr. ${result.prescriberName.replace(/^Dr\.?\s*/i, "")}`
        : "Prescription Consultation";
      const medSummary = result.medications.map((m) => m.name).filter(Boolean).join(", ");

      await tx.healthHistoryEntry.create({
        data: {
          patientId,
          kind: "condition",
          title: doctorTitle,
          notes: `Prescribed medications: ${medSummary || "Medicines listed"}. Recorded automatically from prescription.`,
          diagnosedOn: result.prescriptionDate ?? today,
          source: "patient_reported",
          verificationStatus: "unverified",
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
  } catch (err) {
    // Patient data arrived mid-run: give the record back instead of leaving it "processing".
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
