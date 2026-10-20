import { z } from "zod";
import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { hasNoControlChars, parseDateOnly } from "../../lib/text.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { recordAudit } from "../audit/audit.js";
import { diffVersions, MEDICATION_FIELDS, sameMedication, type MedicationFields } from "./diff.js";
import { PROCESSING_STALE_MS } from "./processing.js";
import { MAX_MEDICATIONS, MAX_TEXT_LENGTH } from "./safetyGate.js";
import { toVersionDto, VERSION_SELECT, type VersionDto } from "./versions.js";

interface Ctx {
  requestId: string;
}

const text = z.string().trim().min(1).max(MAX_TEXT_LENGTH).refine(hasNoControlChars);

const today = (): string => new Date().toISOString().slice(0, 10);
const date = z
  .string()
  .refine((value) => parseDateOnly(value) !== null, "not a real calendar date")
  .refine((value) => value >= "1900-01-01" && value <= today(), "out of range");

const medication = z
  .strictObject({
    name: text.nullable().optional(),
    strength: text.nullable().optional(),
    dose: text.nullable().optional(),
    route: text.nullable().optional(),
    frequency: text.nullable().optional(),
    duration: text.nullable().optional(),
    instructions: text.nullable().optional(),

    confirmed: z.boolean().optional(),
  })

  .refine((row) => MEDICATION_FIELDS.some((field) => typeof row[field] === "string"));

export const correctionSchema = z
  .strictObject({
    baseVersionNumber: z.number().int().min(0).max(1_000_000),
    prescriptionDate: date.nullable().optional(),
    prescriberName: text.nullable().optional(),
    medications: z.array(medication).max(MAX_MEDICATIONS).optional(),
  })
  .refine((value) => value.prescriptionDate !== undefined || value.prescriberName !== undefined || value.medications !== undefined);

export type CorrectionInput = z.infer<typeof correctionSchema>;

const orNull = (value: string | null | undefined): string | null => value ?? null;

function withConfirmed(changed: string[], confirmedRows: number[]): string[] {
  const out: string[] = [];
  const pending = [...confirmedRows].sort((a, b) => a - b);
  const flushBefore = (row: number) => {
    while (pending.length > 0 && (pending[0] as number) < row) out.push(`medications.${pending.shift()}.confirmed`);
  };
  for (const name of changed) {
    const row = /^medications\.(\d+)\./.exec(name)?.[1];
    if (row !== undefined) flushBefore(Number(row));
    out.push(name);
  }
  flushBefore(Number.POSITIVE_INFINITY);
  return out;
}

export async function correctPrescription(
  db: Db,
  auth: AuthContext,
  target: { prescriptionId: string; patientId: string },
  input: CorrectionInput,
  ctx: Ctx,
): Promise<VersionDto> {
  const { prescriptionId, patientId } = target;

  let created;
  try {
    created = await db.$transaction(async (tx) => {

      await tx.$queryRaw`SELECT "id" FROM "PrescriptionRecord" WHERE "id" = ${prescriptionId}::uuid FOR UPDATE`;

      const record = await tx.prescriptionRecord.findUniqueOrThrow({
        where: { id: prescriptionId },
        select: { processingStatus: true, updatedAt: true },
      });
      const inProgress = record.processingStatus === "processing" && record.updatedAt.getTime() > Date.now() - PROCESSING_STALE_MS;
      if (inProgress) throw new AppError("CONFLICT", "The prescription is being processed");

      const latest = await tx.prescriptionVersion.findFirst({
        where: { prescriptionId },
        orderBy: { versionNumber: "desc" },
        select: { ...VERSION_SELECT },
      });
      const currentNumber = latest?.versionNumber ?? 0;
      if (input.baseVersionNumber !== currentNumber) throw new AppError("CONFLICT", "The record changed since you loaded it");

      const previous = {
        prescriptionDate: latest?.prescriptionDate ? latest.prescriptionDate.toISOString().slice(0, 10) : null,
        prescriberName: latest?.prescriberName ?? null,
        medications: (latest?.medications ?? []).map((m): MedicationFields => ({
          name: m.name, strength: m.strength, dose: m.dose, route: m.route,
          frequency: m.frequency, duration: m.duration, instructions: m.instructions,
        })),
      };
      const previousConfidence = (latest?.medications ?? []).map((m) => m.confidence);

      const nextDate = input.prescriptionDate !== undefined ? input.prescriptionDate : previous.prescriptionDate;
      const nextPrescriber = input.prescriberName !== undefined ? input.prescriberName : previous.prescriberName;
      const nextMedications: MedicationFields[] =
        input.medications !== undefined
          ? input.medications.map((m) => ({
              name: orNull(m.name), strength: orNull(m.strength), dose: orNull(m.dose), route: orNull(m.route),
              frequency: orNull(m.frequency), duration: orNull(m.duration), instructions: orNull(m.instructions),
            }))
          : previous.medications;

      const confirmedFlags = (input.medications ?? []).map((m) => m.confirmed === true);
      const diffed = diffVersions(previous, {
        prescriptionDate: nextDate,
        prescriberName: nextPrescriber,
        medications: nextMedications,
      });

      const confirmedRows = nextMedications
        .map((row, position) => ({ row, position }))
        .filter(({ row, position }) => {
          const before = previous.medications[position];
          return confirmedFlags[position] === true && before !== undefined && sameMedication(before, row) && (previousConfidence[position] ?? 1) < 1;
        })
        .map(({ position }) => position);
      const changedFields = withConfirmed(diffed, confirmedRows);

      const version = await tx.prescriptionVersion.create({
        data: {
          prescriptionId,
          versionNumber: currentNumber + 1,
          kind: "patient_correction",
          verificationStatus: "patient_corrected",
          extractionProvider: null,
          extractionConfidence: null,
          prescriptionDate: nextDate ? parseDateOnly(nextDate) : null,
          prescriberName: nextPrescriber,
          changedFields,
          createdByUserId: auth.userId,
          medications: {
            create: nextMedications.map((row, position) => {
              const before = previous.medications[position];
              const unchanged = before !== undefined && sameMedication(before, row);
              const keepsPrevious = unchanged && confirmedFlags[position] !== true;
              return { position, ...row, confidence: keepsPrevious ? (previousConfidence[position] ?? 1) : 1 };
            }),
          },
        },
        select: VERSION_SELECT,
      });

      await recordAudit(tx, {
        action: "prescription.corrected",
        outcome: "success",
        actorUserId: auth.userId,
        patientId,
        resourceType: "prescription",
        resourceId: prescriptionId,
        requestId: ctx.requestId,

        metadata: { versionNumber: version.versionNumber, baseVersionNumber: input.baseVersionNumber, changedFields },
      });
      return version;
    });
  } catch (err) {

    if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002") {
      throw new AppError("CONFLICT", "The record changed since you loaded it");
    }
    throw err;
  }

  return toVersionDto(created);
}
