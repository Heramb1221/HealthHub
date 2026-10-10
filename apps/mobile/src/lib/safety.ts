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

/**
 * Whether the UI may offer "Add to schedule" for this medication. Conservative: the prescription must have
 * finished processing, must not be flagged for review as a whole, and the medication itself must be complete.
 */
export function canOfferSchedule(prescription: Pick<Prescription, "processingStatus" | "verificationStatus">, med: PrescriptionMedication): boolean {
  return (
    prescription.processingStatus === "completed" &&
    prescription.verificationStatus !== "needs_review" &&
    isInstructionSafe(med)
  );
}

/** A dose line is shown as an instruction only when safe; otherwise the UI shows "Needs review". */
export function doseLine(med: PrescriptionMedication): string | null {
  if (!isInstructionSafe(med)) return null;
  return [med.name, med.strength, med.dose, med.frequency, med.duration].filter((part) => part && part.trim()).join(" · ");
}
