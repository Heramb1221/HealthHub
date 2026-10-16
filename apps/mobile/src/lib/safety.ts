import type { Prescription, PrescriptionMedication } from "../api/types.ts";

/**
 * Safety policy for extracted prescription data (AGENTS.md; PRODUCT_SPEC "Prescription data rules").
 * Mirrors the web workstream so both clients label the same medication the same way.
 *
 * This is a DISPLAY and UX gate only. The server remains the authority: it must refuse to build a
 * schedule or dose instruction from incomplete or ambiguous data regardless of what the client sends.
 *
 * ASSUMPTION: 0.85 is a display threshold shared with the web app. If the backend adds a per-field
 * review flag, prefer it and keep this as a fallback.
 */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.85;

export const REQUIRED_FOR_INSTRUCTION = ["name", "strength", "dose", "frequency"] as const;
type RequiredField = (typeof REQUIRED_FOR_INSTRUCTION)[number];

export type ReviewReason = "low_confidence" | `missing_${RequiredField}`;

export const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  low_confidence: "Low reading confidence",
  missing_name: "Medicine name not found",
  missing_strength: "Strength not found",
  missing_dose: "Dose not found",
  missing_frequency: "How often not found",
};

export function medicationReviewReasons(med: PrescriptionMedication): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  if (!Number.isFinite(med.confidence) || med.confidence < REVIEW_CONFIDENCE_THRESHOLD) reasons.push("low_confidence");
  for (const field of REQUIRED_FOR_INSTRUCTION) {
    const value = med[field];
    if (typeof value !== "string" || value.trim() === "") reasons.push(`missing_${field}`);
  }
  return reasons;
}

/** True only when every instruction field is present and confidently read. */
export function isInstructionSafe(med: PrescriptionMedication): boolean {
  return medicationReviewReasons(med).length === 0;
}

/** BACKEND K2: a version counts as reviewed only after a person corrected or confirmed it. */
export function isReviewedByPerson(status: Prescription["verificationStatus"]): boolean {
  return status === "patient_corrected" || status === "verified_by_authorized_clinician";
}

export type ScheduleBlock = "not_finished" | "not_reviewed" | "incomplete" | "low_confidence";

/**
 * Why "Add to schedule" is not offered, or null when it is. Mirrors backend K2 (reviewed by a person, complete,
 * confidence >= 0.85) so the patient is told what to do, but the server decides and may still refuse.
 */
export function scheduleBlock(
  prescription: Pick<Prescription, "processingStatus" | "verificationStatus">,
  med: PrescriptionMedication,
): ScheduleBlock | null {
  if (prescription.processingStatus !== "completed") return "not_finished";
  if (!isReviewedByPerson(prescription.verificationStatus)) return "not_reviewed";
  const reasons = medicationReviewReasons(med);
  if (reasons.some((r) => r.startsWith("missing_"))) return "incomplete";
  if (reasons.includes("low_confidence")) return "low_confidence";
  return null;
}

export const SCHEDULE_BLOCK_LABEL: Record<ScheduleBlock, string> = {
  not_finished: "A schedule can be made once the prescription has been read.",
  not_reviewed: "To make a schedule, first review these details against your paper prescription and save them.",
  incomplete: "A schedule can't be made until the name, strength, dose and how often are all filled in.",
  low_confidence: "Tick \"I checked this medicine\" when you review the details to confirm it against your paper prescription.",
};

/** Whether the UI may offer "Add to schedule" for this medication. */
export function canOfferSchedule(prescription: Pick<Prescription, "processingStatus" | "verificationStatus">, med: PrescriptionMedication): boolean {
  return scheduleBlock(prescription, med) === null;
}

/** A dose line is shown as an instruction only when safe; otherwise the UI shows "Needs review". */
export function doseLine(med: PrescriptionMedication): string | null {
  if (!isInstructionSafe(med)) return null;
  return [med.name, med.strength, med.dose, med.frequency, med.duration].filter((part) => part && part.trim()).join(" · ");
}
