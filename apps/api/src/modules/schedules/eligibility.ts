import { CONFIDENCE_REVIEW_THRESHOLD } from "../prescriptions/safetyGate.js";

/**
 * Whether one medication row may become a reminder schedule. This is the
 * single gate between prescription data and anything the patient is reminded
 * to do, so it is deliberately strict and never guesses:
 *
 * 1. The version must have been looked at by a person: `patient_corrected`
 *    (the patient's own review) or `verified_by_authorized_clinician`.
 *    `unverified` and `needs_review` are never enough, however confident the
 *    automatic reading was.
 * 2. Name, strength, dose, and frequency must all be present and contain real
 *    content (a letter or digit, not "???").
 * 3. The row's confidence must be at or above the review threshold. For a
 *    patient-reviewed version that means the row was edited, added, or
 *    explicitly confirmed (or was read confidently and left unchanged).
 */
export type IneligibleReason = "not_reviewed" | "incomplete" | "low_confidence";

export const REVIEWED_STATUSES: readonly string[] = ["patient_corrected", "verified_by_authorized_clinician"];

export const REFUSAL_MESSAGE: Record<IneligibleReason, string> = {
  not_reviewed: "The prescription must be reviewed and confirmed before a schedule can be made",
  incomplete: "Name, strength, dose, and frequency must all be filled in before a schedule can be made",
  low_confidence: "This medication has not been confirmed clearly enough. Edit it or mark it as confirmed first",
};

export interface EligibilityInput {
  verificationStatus: string;
  medication: {
    name: string | null;
    strength: string | null;
    dose: string | null;
    frequency: string | null;
    confidence: number;
  };
}

const hasContent = (value: string | null): value is string => value !== null && /[\p{L}\p{N}]/u.test(value);

export function checkScheduleEligibility(input: EligibilityInput): { ok: true } | { ok: false; reason: IneligibleReason } {
  if (!REVIEWED_STATUSES.includes(input.verificationStatus)) return { ok: false, reason: "not_reviewed" };

  const { name, strength, dose, frequency, confidence } = input.medication;
  if (![name, strength, dose, frequency].every(hasContent)) return { ok: false, reason: "incomplete" };

  if (!(typeof confidence === "number" && Number.isFinite(confidence) && confidence >= CONFIDENCE_REVIEW_THRESHOLD)) {
    return { ok: false, reason: "low_confidence" };
  }
  return { ok: true };
}
