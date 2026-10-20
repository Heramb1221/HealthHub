import { describe, expect, it } from "vitest";
import { checkScheduleEligibility, REFUSAL_MESSAGE, REVIEWED_STATUSES, type EligibilityInput } from "../src/modules/schedules/eligibility.js";
import { CONFIDENCE_REVIEW_THRESHOLD } from "../src/modules/prescriptions/safetyGate.js";

const input = (status = "patient_corrected", med: Partial<EligibilityInput["medication"]> = {}): EligibilityInput => ({
  verificationStatus: status,
  medication: { name: "Examplecillin", strength: "250 mg", dose: "1 tablet", frequency: "three times daily", confidence: 0.97, ...med },
});

describe("checkScheduleEligibility", () => {
  it("allows a complete, confident row from a version a person has reviewed", () => {
    for (const status of ["patient_corrected", "verified_by_authorized_clinician"]) {
      expect(checkScheduleEligibility(input(status))).toEqual({ ok: true });
    }
  });

  it("accepts a confidence exactly at the threshold, and refuses just below it", () => {
    expect(CONFIDENCE_REVIEW_THRESHOLD).toBe(0.85);
    expect(checkScheduleEligibility(input("patient_corrected", { confidence: 0.85 }))).toEqual({ ok: true });
    expect(checkScheduleEligibility(input("patient_corrected", { confidence: 0.8499 }))).toEqual({ ok: false, reason: "low_confidence" });
  });

  it("never schedules from a version nobody has reviewed, however perfect the row looks", () => {
    for (const status of ["unverified", "needs_review", "extraction", "verified", "", "PATIENT_CORRECTED", "patient_corrected "]) {
      expect(checkScheduleEligibility(input(status, { confidence: 1 })), JSON.stringify(status)).toEqual({ ok: false, reason: "not_reviewed" });
    }
    expect(REVIEWED_STATUSES).toEqual(["patient_corrected", "verified_by_authorized_clinician"]);
  });

  it.each(["name", "strength", "dose", "frequency"] as const)("requires %s", (field) => {
    expect(checkScheduleEligibility(input("patient_corrected", { [field]: null }))).toEqual({ ok: false, reason: "incomplete" });
  });

  it("treats a field with no real content as missing", () => {
    for (const junk of ["", "   ", "???", "-", "...", "?", "/ /", "\u2014", "()"]) {
      expect(checkScheduleEligibility(input("patient_corrected", { dose: junk })), JSON.stringify(junk)).toEqual({ ok: false, reason: "incomplete" });
      expect(checkScheduleEligibility(input("patient_corrected", { frequency: junk })), JSON.stringify(junk)).toEqual({ ok: false, reason: "incomplete" });
    }
    for (const real of ["1", "½ tablet", "5 mL", "twice daily", "OD", "处方"]) {
      expect(checkScheduleEligibility(input("patient_corrected", { dose: real })), real).toEqual({ ok: true });
    }
  });

  it("refuses an invalid confidence", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 0.5, undefined as unknown as number, "1" as unknown as number, null as unknown as number]) {
      expect(checkScheduleEligibility(input("patient_corrected", { confidence: bad })), String(bad)).toEqual({ ok: false, reason: "low_confidence" });
    }
  });

  it("reports the most basic problem first", () => {
    expect(checkScheduleEligibility(input("unverified", { dose: null, confidence: 0 }))).toEqual({ ok: false, reason: "not_reviewed" });
    expect(checkScheduleEligibility(input("patient_corrected", { dose: null, confidence: 0 }))).toEqual({ ok: false, reason: "incomplete" });
    expect(checkScheduleEligibility(input("patient_corrected", { confidence: 0 }))).toEqual({ ok: false, reason: "low_confidence" });
  });

  it("has a refusal message for every reason, and none contains medical content", () => {
    for (const reason of ["not_reviewed", "incomplete", "low_confidence"] as const) {
      expect(REFUSAL_MESSAGE[reason].length).toBeGreaterThan(10);
    }
  });

  it("admits a row only when all three rules hold, across thousands of random inputs", () => {
    let seed = 987654321;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)] as T;
    const statuses = ["unverified", "needs_review", "patient_corrected", "verified_by_authorized_clinician", "other"];
    const texts: Array<string | null> = [null, "", "  ", "???", "x", "1 tablet", "twice daily", "-"];
    const confidences = [0, 0.3, 0.8499, 0.85, 0.9, 1, -1, 2, Number.NaN, Number.POSITIVE_INFINITY];
    let allowed = 0;
    for (let i = 0; i < 6000; i += 1) {
      const status = pick(statuses);
      const med = { name: pick(texts), strength: pick(texts), dose: pick(texts), frequency: pick(texts), confidence: pick(confidences) };
      const result = checkScheduleEligibility({ verificationStatus: status, medication: med });
      const real = (t: string | null) => t !== null && /[\p{L}\p{N}]/u.test(t);
      const expected =
        REVIEWED_STATUSES.includes(status) && [med.name, med.strength, med.dose, med.frequency].every(real) && Number.isFinite(med.confidence) && med.confidence >= 0.85 && med.confidence <= 2;

      if (result.ok) {
        allowed += 1;
        expect(REVIEWED_STATUSES).toContain(status);
        expect([med.name, med.strength, med.dose, med.frequency].every(real)).toBe(true);
        expect(med.confidence).toBeGreaterThanOrEqual(0.85);
      } else {
        expect(expected && med.confidence <= 1).toBe(false);
      }
    }
    expect(allowed).toBeGreaterThan(0);
  });
});
