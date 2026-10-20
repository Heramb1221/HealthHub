import { CONFIDENCE_REVIEW_THRESHOLD } from "../prescriptions/safetyGate.js";

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
