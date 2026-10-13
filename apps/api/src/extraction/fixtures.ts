/**
 * Synthetic prescription fixtures for development and tests. Every name,
 * drug, dose, and date here is fictional and must never be used as medical
 * information. Drug names are deliberately made up.
 *
 * Each fixture is the RAW provider output (before the safety gate), keyed by
 * the id embedded in a synthetic document as `HEALTHHUB-SYNTHETIC-FIXTURE:<id>`.
 */
export const FIXTURE_MARKER = "HEALTHHUB-SYNTHETIC-FIXTURE:";

export interface SyntheticFixture {
  /** Human-readable lines printed on the generated synthetic PDF. */
  documentLines: string[];
  /** Raw provider output for this document. Intentionally untyped: some fixtures are malformed on purpose. */
  raw: unknown;
}

export const FIXTURES: Record<string, SyntheticFixture> = {
  // Every field present and read with high confidence. Still only "unverified": only a person can verify.
  "clear-001": {
    documentLines: [
      "Prescriber: Dr. A. Example (synthetic)",
      "Date: 2026-09-01",
      "1. Examplecillin 250 mg - 1 tablet - three times daily - 5 days",
      "2. Testrin 10 mg - 1 tablet - once daily - 30 days",
    ],
    raw: {
      prescriptionDate: "2026-09-01",
      prescriberName: "Dr. A. Example (synthetic)",
      overallConfidence: 0.96,
      medications: [
        { name: "Examplecillin", strength: "250 mg", dose: "1 tablet", route: "oral", frequency: "three times daily", duration: "5 days", instructions: "After food", confidence: 0.97 },
        { name: "Testrin", strength: "10 mg", dose: "1 tablet", route: "oral", frequency: "once daily", duration: "30 days", instructions: null, confidence: 0.95 },
      ],
    },
  },

  // Handwriting unclear: a missing dose, a missing strength, and low confidence. Must need review.
  "ambiguous-001": {
    documentLines: [
      "Prescriber: Dr. B. Sample (synthetic)",
      "Date: 2026-09-03",
      "1. Testrin 10 mg - ??? - twice daily",
      "2. Demovit ??? - 1 capsule - once daily",
      "3. Samplex 5 mg - 1 tablet - at night - 7 days",
    ],
    raw: {
      prescriptionDate: "2026-09-03",
      prescriberName: "Dr. B. Sample (synthetic)",
      overallConfidence: 0.62,
      medications: [
        { name: "Testrin", strength: "10 mg", dose: null, route: null, frequency: "twice daily", duration: null, instructions: null, confidence: 0.55 },
        { name: "Demovit", strength: null, dose: "1 capsule", route: "oral", frequency: "once daily", duration: null, instructions: null, confidence: 0.4 },
        { name: "Samplex", strength: "5 mg", dose: "1 tablet", route: "oral", frequency: "at night", duration: "7 days", instructions: null, confidence: 0.9 },
      ],
    },
  },

  // Nothing could be read.
  "illegible-001": {
    documentLines: ["(illegible synthetic document)"],
    raw: { prescriptionDate: null, prescriberName: null, overallConfidence: 0.12, medications: [] },
  },

  // Hostile or broken provider output: out-of-range numbers, control characters,
  // oversized text, a future date, and far too many rows. Used to prove the gate holds.
  "adversarial-001": {
    documentLines: ["(adversarial synthetic document: malformed provider output)"],
    raw: {
      prescriptionDate: "2999-01-01",
      prescriberName: "Dr.\u0000 Bad\u0007 Output\n(synthetic)",
      overallConfidence: 7,
      medications: [
        { name: "A".repeat(5000), strength: "10 mg", dose: "1", route: null, frequency: "daily", duration: null, instructions: "line1\nline2\u0000", confidence: 1.7 },
        { name: "Negativex", strength: "1 mg", dose: "1", route: null, frequency: "daily", duration: null, instructions: null, confidence: -3 },
        { name: "Notanumber", strength: "1 mg", dose: "1", route: null, frequency: "daily", duration: null, instructions: null, confidence: "high" },
        { name: null, strength: null, dose: null, route: null, frequency: null, duration: null, instructions: null, confidence: 0.99 },
        ...Array.from({ length: 40 }, (_, i) => ({
          name: `Filler${i}`, strength: "1 mg", dose: "1", route: null, frequency: "daily", duration: null, instructions: null, confidence: 0.99,
        })),
      ],
    },
  },
};
