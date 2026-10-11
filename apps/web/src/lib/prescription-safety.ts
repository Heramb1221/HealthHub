import type { PrescriptionMedication } from "@/lib/api/types";

/**
 * Safety policy for extracted prescription data (AGENTS.md, PRODUCT_SPEC.md "Prescription data rules").
 *
 * Extracted values below the threshold, or missing a required field, are shown as "Needs review"
 * and must never be rendered as a definitive dose instruction or turned into a medication schedule.
 *
 * ASSUMPTION: 0.85 is a UI display threshold chosen by the web workstream. The backend may also
 * flag uncertainty; if the contract adds a per-field flag, prefer it and keep this as a fallback.
 */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.85;

const REQUIRED_FOR_INSTRUCTION = ["name", "strength", "dose", "frequency"] as const;

export type ReviewReason = "low_confidence" | "missing_name" | "missing_strength" | "missing_dose" | "missing_frequency";

export const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  low_confidence: "Low reading confidence",
  missing_name: "Medicine name not found",
  missing_strength: "Strength not found",
  missing_dose: "Dose not found",
  missing_frequency: "How often not found",
};

export function medicationReviewReasons(med: PrescriptionMedication): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  if (med.confidence < REVIEW_CONFIDENCE_THRESHOLD) reasons.push("low_confidence");
  for (const field of REQUIRED_FOR_INSTRUCTION) {
    if (!med[field] || !med[field]?.trim()) reasons.push(`missing_${field}` as ReviewReason);
  }
  return reasons;
}

/** True only when every instruction field is present and confident. Gate for showing a dose line or building a schedule. */
export function isInstructionSafe(med: PrescriptionMedication): boolean {
  return medicationReviewReasons(med).length === 0;
}
