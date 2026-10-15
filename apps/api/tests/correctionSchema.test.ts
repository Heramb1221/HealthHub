import { describe, expect, it } from "vitest";
import { correctionSchema } from "../src/modules/prescriptions/corrections.js";

const ok = (body: unknown) => correctionSchema.safeParse(body).success;
const med = { name: "Examplecillin", dose: "1 tablet" };

describe("correctionSchema", () => {
  it("accepts a valid correction and applies trimming", () => {
    const parsed = correctionSchema.parse({ baseVersionNumber: 1, prescriberName: "  Dr. A  ", medications: [{ name: " X " }] });
    expect(parsed.prescriberName).toBe("Dr. A");
    expect(parsed.medications?.[0]?.name).toBe("X");
  });

  it("requires baseVersionNumber to be a non-negative integer", () => {
    expect(ok({ prescriberName: "Dr" })).toBe(false);
    for (const bad of [-1, 1.5, "1", null, NaN, Infinity, 2_000_000]) expect(ok({ baseVersionNumber: bad, prescriberName: "Dr" }), String(bad)).toBe(false);
    expect(ok({ baseVersionNumber: 0, prescriberName: "Dr" })).toBe(true);
  });

  it("requires at least one field to change or confirm", () => {
    expect(ok({ baseVersionNumber: 1 })).toBe(false);
    expect(ok({ baseVersionNumber: 1, prescriptionDate: null })).toBe(true);
    expect(ok({ baseVersionNumber: 1, medications: [] })).toBe(true);
  });

  it("rejects every field it does not know, including anything that looks like a status or ownership", () => {
    for (const extra of [
      { verificationStatus: "verified_by_authorized_clinician" }, { status: "verified" }, { healthId: "HH-X" }, { patientId: "x" },
      { prescriptionId: "x" }, { confidence: 1 }, { kind: "extraction" }, { createdByUserId: "x" }, { versionNumber: 5 },
    ]) {
      expect(ok({ baseVersionNumber: 1, prescriberName: "Dr", ...extra }), JSON.stringify(extra)).toBe(false);
    }
    expect(ok({ baseVersionNumber: 1, medications: [{ ...med, confidence: 1 }] })).toBe(false);
    expect(ok({ baseVersionNumber: 1, medications: [{ ...med, verificationStatus: "verified" }] })).toBe(false);
  });

  it("validates dates strictly", () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    for (const bad of [tomorrow, "2999-01-01", "2026-02-30", "1899-12-31", "01/09/2026", "2026-09-01T10:00:00Z", "tomorrow", "", 20260901, {}]) {
      expect(ok({ baseVersionNumber: 1, prescriptionDate: bad }), String(bad)).toBe(false);
    }
    expect(ok({ baseVersionNumber: 1, prescriptionDate: new Date().toISOString().slice(0, 10) })).toBe(true);
    expect(ok({ baseVersionNumber: 1, prescriptionDate: "1900-01-01" })).toBe(true);
  });

  it("validates text fields", () => {
    for (const bad of ["", "   ", "x".repeat(201), "line\nbreak", "tab\there", "nul\u0000", 5, [], {}]) {
      expect(ok({ baseVersionNumber: 1, prescriberName: bad }), JSON.stringify(bad)).toBe(false);
      expect(ok({ baseVersionNumber: 1, medications: [{ name: bad }] }), JSON.stringify(bad)).toBe(false);
    }
    expect(ok({ baseVersionNumber: 1, prescriberName: "x".repeat(200) })).toBe(true);
  });

  it("validates medication rows", () => {
    expect(ok({ baseVersionNumber: 1, medications: [{}] })).toBe(false);
    expect(ok({ baseVersionNumber: 1, medications: [{ name: null, dose: null }] })).toBe(false);
    expect(ok({ baseVersionNumber: 1, medications: ["x"] })).toBe(false);
    expect(ok({ baseVersionNumber: 1, medications: "x" })).toBe(false);
    expect(ok({ baseVersionNumber: 1, medications: [{ dose: "1 tablet" }] })).toBe(true); // a row needs only some content
    expect(ok({ baseVersionNumber: 1, medications: Array.from({ length: 30 }, () => med) })).toBe(true);
    expect(ok({ baseVersionNumber: 1, medications: Array.from({ length: 31 }, () => med) })).toBe(false);
  });

  it("accepts an explicit confirmation on a row, but only as a boolean alongside real content", () => {
    expect(ok({ baseVersionNumber: 1, medications: [{ ...med, confirmed: true }] })).toBe(true);
    expect(ok({ baseVersionNumber: 1, medications: [{ ...med, confirmed: false }] })).toBe(true);
    for (const bad of ["true", 1, null, {}, []]) expect(ok({ baseVersionNumber: 1, medications: [{ ...med, confirmed: bad }] }), JSON.stringify(bad)).toBe(false);
    // "confirmed" alone is not a row: there is nothing to confirm.
    expect(ok({ baseVersionNumber: 1, medications: [{ confirmed: true }] })).toBe(false);
    expect(ok({ baseVersionNumber: 1, confirmed: true })).toBe(false);
  });

  it("never throws on hostile input", () => {
    for (const bad of [null, undefined, "x", 5, [], [1], { baseVersionNumber: {} }, { __proto__: { baseVersionNumber: 1 } }, JSON.parse('{"__proto__":{"a":1},"baseVersionNumber":1,"prescriberName":"x"}')]) {
      expect(() => correctionSchema.safeParse(bad)).not.toThrow();
    }
  });
});
