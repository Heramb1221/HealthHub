import { describe, expect, it } from "vitest";
import { diffVersions, sameMedication, type MedicationFields, type VersionContent } from "../src/modules/prescriptions/diff.js";

const med = (o: Partial<MedicationFields> = {}): MedicationFields => ({
  name: "Examplecillin", strength: "250 mg", dose: "1 tablet", route: "oral", frequency: "daily", duration: "5 days", instructions: null, ...o,
});
const content = (o: Partial<VersionContent> = {}): VersionContent => ({
  prescriptionDate: "2026-09-01", prescriberName: "Dr. A", medications: [med()], ...o,
});

describe("diffVersions", () => {
  it("reports nothing when nothing changed", () => {
    expect(diffVersions(content(), content())).toEqual([]);
  });

  it("names changed top-level fields", () => {
    expect(diffVersions(content(), content({ prescriptionDate: "2026-09-02" }))).toEqual(["prescriptionDate"]);
    expect(diffVersions(content(), content({ prescriberName: null }))).toEqual(["prescriberName"]);
    expect(diffVersions(content(), content({ prescriptionDate: null, prescriberName: "Dr. B" }))).toEqual(["prescriptionDate", "prescriberName"]);
  });

  it("names changed medication fields by row", () => {
    const next = content({ medications: [med({ dose: "2 tablets", frequency: "twice daily" })] });
    expect(diffVersions(content(), next)).toEqual(["medications.0.dose", "medications.0.frequency"]);
  });

  it("names added and removed rows", () => {
    expect(diffVersions(content(), content({ medications: [med(), med({ name: "Testrin" })] }))).toEqual(["medications.1.added"]);
    expect(diffVersions(content({ medications: [med(), med({ name: "Testrin" })] }), content())).toEqual(["medications.1.removed"]);
    expect(diffVersions(content(), content({ medications: [] }))).toEqual(["medications.0.removed"]);
  });

  it("treats null and a value as different, in both directions", () => {
    expect(diffVersions(content(), content({ medications: [med({ instructions: "After food" })] }))).toEqual(["medications.0.instructions"]);
    expect(diffVersions(content(), content({ medications: [med({ strength: null })] }))).toEqual(["medications.0.strength"]);
  });

  it("never includes any value in its output", () => {
    const out = diffVersions(
      content({ prescriberName: "Secret Doctor" }),
      content({ prescriberName: "Other Secret", medications: [med({ name: "SecretDrug", dose: "99 units" })] }),
    );
    for (const name of out) expect(name).toMatch(/^(prescriptionDate|prescriberName|medications\.\d+\.(name|strength|dose|route|frequency|duration|instructions|added|removed))$/);
    expect(JSON.stringify(out)).not.toMatch(/Secret|units/);
  });
});

describe("sameMedication", () => {
  it("compares every text field", () => {
    expect(sameMedication(med(), med())).toBe(true);
    for (const field of ["name", "strength", "dose", "route", "frequency", "duration", "instructions"] as const) {
      expect(sameMedication(med(), med({ [field]: "changed" })), field).toBe(false);
    }
  });
});
