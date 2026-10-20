
export type ExtractionVerification = "unverified" | "needs_review";

export type ReviewReason =
  | "no_medications"
  | "low_confidence"
  | "missing_critical_field"
  | "low_overall_confidence"
  | "date_rejected"
  | "text_truncated"
  | "too_many_medications";

export const CONFIDENCE_REVIEW_THRESHOLD = 0.85;
export const MAX_MEDICATIONS = 30;
export const MAX_TEXT_LENGTH = 200;

export interface NormalizedMedication {
  name: string | null;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  confidence: number;
}

export interface NormalizedExtraction {
  prescriptionDate: Date | null;
  prescriberName: string | null;
  overallConfidence: number;
  medications: NormalizedMedication[];
  verificationStatus: ExtractionVerification;

  reviewReasons: ReviewReason[];
}

const TEXT_FIELDS = ["name", "strength", "dose", "route", "frequency", "duration", "instructions"] as const;

const CRITICAL_FIELDS = ["name", "strength", "dose", "frequency"] as const;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

function cleanText(value: unknown, reasons: Set<ReviewReason>): string | null {
  if (typeof value !== "string") return null;
  const spaced = [...value].map((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? " " : char;
  });
  const cleaned = spaced.join("").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length > MAX_TEXT_LENGTH) {
    reasons.add("text_truncated");
    return cleaned.slice(0, MAX_TEXT_LENGTH).trim();
  }
  return cleaned;
}

function validConfidence(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
}

function parseDate(value: unknown, today: string, reasons: Set<ReviewReason>): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "1900-01-01" && value <= today) {
      return date;
    }
  }
  reasons.add("date_rejected");
  return null;
}

export function normalizeExtraction(raw: unknown, now: Date = new Date()): { ok: true; value: NormalizedExtraction } | { ok: false } {
  const record = asRecord(raw);
  if (!record || !Array.isArray(record.medications)) return { ok: false };

  const reasons = new Set<ReviewReason>();
  const today = now.toISOString().slice(0, 10);

  const rows: NormalizedMedication[] = [];
  for (const item of record.medications as unknown[]) {
    const row = asRecord(item);
    if (!row) continue;
    const medication = {
      name: cleanText(row.name, reasons),
      strength: cleanText(row.strength, reasons),
      dose: cleanText(row.dose, reasons),
      route: cleanText(row.route, reasons),
      frequency: cleanText(row.frequency, reasons),
      duration: cleanText(row.duration, reasons),
      instructions: cleanText(row.instructions, reasons),
      confidence: validConfidence(row.confidence),
    };

    if (TEXT_FIELDS.every((field) => medication[field] === null)) continue;
    rows.push(medication);
  }

  if (rows.length > MAX_MEDICATIONS) reasons.add("too_many_medications");
  const medications = rows.slice(0, MAX_MEDICATIONS);

  if (medications.length === 0) reasons.add("no_medications");
  if (medications.some((m) => m.confidence < CONFIDENCE_REVIEW_THRESHOLD)) reasons.add("low_confidence");
  if (medications.some((m) => CRITICAL_FIELDS.some((field) => m[field] === null))) reasons.add("missing_critical_field");

  const prescriptionDate = parseDate(record.prescriptionDate, today, reasons);
  const prescriberName = cleanText(record.prescriberName, reasons);

  const overallConfidence =
    record.overallConfidence === undefined
      ? medications.length > 0
        ? Math.min(...medications.map((m) => m.confidence))
        : 0
      : validConfidence(record.overallConfidence);
  if (overallConfidence < CONFIDENCE_REVIEW_THRESHOLD) reasons.add("low_overall_confidence");

  return {
    ok: true,
    value: {
      prescriptionDate,
      prescriberName,
      overallConfidence,
      medications,
      verificationStatus: reasons.size > 0 ? "needs_review" : "unverified",
      reviewReasons: [...reasons],
    },
  };
}
