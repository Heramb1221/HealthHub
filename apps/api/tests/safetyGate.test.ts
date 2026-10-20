import { describe, expect, it } from "vitest";
import { FIXTURES } from "../src/extraction/fixtures.js";
import {
  CONFIDENCE_REVIEW_THRESHOLD,
  MAX_MEDICATIONS,
  MAX_TEXT_LENGTH,
  normalizeExtraction,
  type NormalizedExtraction,
} from "../src/modules/prescriptions/safetyGate.js";

const NOW = new Date("2026-10-10T12:00:00Z");

const med = (overrides: Record<string, unknown> = {}) => ({
  name: "Examplecillin", strength: "250 mg", dose: "1 tablet", route: "oral",
  frequency: "daily", duration: "5 days", instructions: "After food", confidence: 0.95, ...overrides,
});
const rx = (medications: unknown[], extra: Record<string, unknown> = {}) => ({
  prescriptionDate: "2026-09-01", prescriberName: "Dr. A. Example (synthetic)", overallConfidence: 0.95, medications, ...extra,
});

function gate(raw: unknown): NormalizedExtraction {
  const result = normalizeExtraction(raw, NOW);
  if (!result.ok) throw new Error("expected ok");
  return result.value;
}

describe("fixtures through the gate", () => {
  it("clear: confident and complete, but still only unverified", () => {
    const out = gate(FIXTURES["clear-001"]?.raw);
    expect(out.verificationStatus).toBe("unverified");
    expect(out.reviewReasons).toEqual([]);
    expect(out.medications).toHaveLength(2);
    expect(out.prescriptionDate?.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(out.overallConfidence).toBe(0.96);
  });

  it("ambiguous: needs review for low confidence, missing fields, and low overall confidence", () => {
    const out = gate(FIXTURES["ambiguous-001"]?.raw);
    expect(out.verificationStatus).toBe("needs_review");
    expect(out.reviewReasons).toEqual(expect.arrayContaining(["low_confidence", "missing_critical_field", "low_overall_confidence"]));
    expect(out.medications).toHaveLength(3);
  });

  it("illegible: no medications means review", () => {
    const out = gate(FIXTURES["illegible-001"]?.raw);
    expect(out.verificationStatus).toBe("needs_review");
    expect(out.reviewReasons).toEqual(expect.arrayContaining(["no_medications", "low_overall_confidence"]));
    expect(out.medications).toEqual([]);
  });

  it("adversarial: everything is bounded, cleaned, and forced to review", () => {
    const out = gate(FIXTURES["adversarial-001"]?.raw);
    expect(out.verificationStatus).toBe("needs_review");
    expect(out.reviewReasons).toEqual(
      expect.arrayContaining(["date_rejected", "text_truncated", "too_many_medications", "low_confidence", "low_overall_confidence"]),
    );
    expect(out.prescriptionDate).toBeNull();
    expect(out.prescriberName).toBe("Dr. Bad Output (synthetic)");
    expect(out.medications).toHaveLength(MAX_MEDICATIONS);
    expect(out.medications[0]?.name?.length).toBe(MAX_TEXT_LENGTH);
    expect(out.medications[0]?.instructions).toBe("line1 line2");

    expect(out.medications.slice(0, 3).map((m) => m.confidence)).toEqual([0, 0, 0]);
    for (const m of out.medications) expect(m.confidence).toBeGreaterThanOrEqual(0);
    for (const m of out.medications) expect(m.confidence).toBeLessThanOrEqual(1);

    expect(out.medications.some((m) => m.name === null && m.strength === null)).toBe(false);
  });
});

describe("review triggers, one at a time", () => {
  it("accepts a fully confident row", () => {
    const out = gate(rx([med()]));
    expect(out.verificationStatus).toBe("unverified");
  });

  it("treats the confidence threshold as inclusive for the passing side", () => {
    expect(CONFIDENCE_REVIEW_THRESHOLD).toBe(0.85);
    expect(gate(rx([med({ confidence: 0.85 })], { overallConfidence: 0.85 })).verificationStatus).toBe("unverified");
    expect(gate(rx([med({ confidence: 0.8499 })])).reviewReasons).toContain("low_confidence");
    expect(gate(rx([med()], { overallConfidence: 0.8499 })).reviewReasons).toContain("low_overall_confidence");
  });

  it.each(["name", "strength", "dose", "frequency"])("requires review when %s is missing", (field) => {
    const out = gate(rx([med({ [field]: null })]));
    expect(out.verificationStatus).toBe("needs_review");
    expect(out.reviewReasons).toContain("missing_critical_field");
  });

  it.each(["route", "duration", "instructions"])("does not require review just because %s is missing", (field) => {
    expect(gate(rx([med({ [field]: null })])).verificationStatus).toBe("unverified");
  });

  it("requires review for blank-but-present critical fields", () => {
    expect(gate(rx([med({ dose: "   " })])).reviewReasons).toContain("missing_critical_field");
  });

  it("handles dates", () => {
    expect(gate(rx([med()], { prescriptionDate: null })).verificationStatus).toBe("unverified");
    expect(gate(rx([med()], { prescriptionDate: undefined })).verificationStatus).toBe("unverified");
    expect(gate(rx([med()], { prescriptionDate: "2026-10-10" })).verificationStatus).toBe("unverified");
    for (const bad of ["2026-10-11", "2999-01-01", "1899-12-31", "2026-02-30", "01/09/2026", "2026-09-01T10:00:00Z", 20260901, {}, "tomorrow"]) {
      const out = gate(rx([med()], { prescriptionDate: bad }));
      expect(out.prescriptionDate, String(bad)).toBeNull();
      expect(out.verificationStatus, String(bad)).toBe("needs_review");
      expect(out.reviewReasons, String(bad)).toContain("date_rejected");
    }
  });

  it("derives overall confidence from the weakest row when not reported, and treats an invalid report as 0", () => {
    const withoutOverall: Record<string, unknown> = rx([med({ confidence: 0.9 }), med({ confidence: 0.99 })]);
    delete withoutOverall.overallConfidence;
    expect(gate(withoutOverall).overallConfidence).toBe(0.9);
    const invalid = gate(rx([med()], { overallConfidence: 9 }));
    expect(invalid.overallConfidence).toBe(0);
    expect(invalid.verificationStatus).toBe("needs_review");
  });

  it("flags more than the maximum number of rows instead of silently dropping them", () => {
    const out = gate(rx(Array.from({ length: MAX_MEDICATIONS + 1 }, (_, i) => med({ name: `Drug${i}` }))));
    expect(out.medications).toHaveLength(MAX_MEDICATIONS);
    expect(out.reviewReasons).toContain("too_many_medications");
  });

  it("skips rows that are not objects", () => {
    const out = gate(rx([1, "a", null, [], med()]));
    expect(out.medications).toHaveLength(1);
  });
});

describe("a provider can never verify its own output", () => {
  it("ignores any status or verification fields in the raw output", () => {
    const out = gate({
      ...rx([med()]),
      verificationStatus: "verified_by_authorized_clinician",
      status: "verified",
      verified: true,
      authoritative: true,
    });
    expect(out.verificationStatus).toBe("unverified");
  });

  it("only ever returns unverified or needs_review, across thousands of random outputs", () => {
    let seed = 123456789;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)] as T;
    const junk = (): unknown =>
      pick<unknown>([null, undefined, "", "   ", "text", "x".repeat(500), "a\u0000b\nc", 0, 1, 0.5, 0.85, 0.99, 1.0001, -1, NaN, Infinity, true, [], {}, [1], { a: 1 }]);
    const randomMed = () =>
      Object.fromEntries(["name", "strength", "dose", "route", "frequency", "duration", "instructions", "confidence", "verificationStatus"].map((k) => [k, junk()]));

    const statuses = new Set<string>();
    for (let i = 0; i < 5000; i += 1) {
      const raw = {
        prescriptionDate: pick<unknown>(["2026-01-01", "2999-01-01", "bad", null, undefined, 5]),
        prescriberName: junk(),
        overallConfidence: junk(),
        verificationStatus: "verified_by_authorized_clinician",
        medications: Array.from({ length: Math.floor(random() * 40) }, () => (random() < 0.9 ? randomMed() : junk())),
      };
      const result = normalizeExtraction(raw, NOW);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const v = result.value;
      statuses.add(v.verificationStatus);
      expect(["unverified", "needs_review"]).toContain(v.verificationStatus);
      expect(v.medications.length).toBeLessThanOrEqual(MAX_MEDICATIONS);
      expect(v.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(v.overallConfidence).toBeLessThanOrEqual(1);
      for (const m of v.medications) {
        expect(m.confidence).toBeGreaterThanOrEqual(0);
        expect(m.confidence).toBeLessThanOrEqual(1);
        for (const text of [m.name, m.strength, m.dose, m.route, m.frequency, m.duration, m.instructions]) {
          if (text === null) continue;
          expect(text.length).toBeGreaterThan(0);
          expect(text.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH);
          expect([...text].every((c) => (c.codePointAt(0) ?? 0) >= 32 && c.codePointAt(0) !== 127)).toBe(true);
        }

        if (v.verificationStatus === "unverified") {
          expect(m.confidence).toBeGreaterThanOrEqual(CONFIDENCE_REVIEW_THRESHOLD);
          for (const field of [m.name, m.strength, m.dose, m.frequency]) expect(field).not.toBeNull();
        }
      }
      if (v.verificationStatus === "unverified") expect(v.overallConfidence).toBeGreaterThanOrEqual(CONFIDENCE_REVIEW_THRESHOLD);
    }

    expect(statuses.has("needs_review")).toBe(true);
  }, 15000);
});

describe("malformed provider output", () => {
  it("is rejected when it is not the right shape", () => {
    for (const bad of [null, undefined, "text", 5, true, [], [1, 2], {}, { medications: "x" }, { medications: null }, { medications: {} }]) {
      expect(normalizeExtraction(bad, NOW), JSON.stringify(bad)).toEqual({ ok: false });
    }
  });

  it("accepts an empty medication list but flags it", () => {
    const out = gate({ medications: [] });
    expect(out.verificationStatus).toBe("needs_review");
  });
});
