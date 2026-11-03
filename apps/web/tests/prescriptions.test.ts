import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toCorrectionBody } from "../src/lib/api/prescriptions";

const med = { name: "Paracetamol", strength: "500 mg", dose: null, route: null, frequency: "1-0-1", duration: "5 days", instructions: null };

describe("prescription correction payload", () => {
  it("always carries baseVersionNumber (the API rejects a correction without it)", () => {
    const body = toCorrectionBody({ baseVersionNumber: 3, prescriptionDate: "2026-10-14", prescriberName: "Dr. A", medications: [med] });
    assert.equal(body.baseVersionNumber, 3);
  });

  it("marks every row confirmed only when the patient ticked the confirmation", () => {
    const base = { baseVersionNumber: 1, prescriptionDate: null, prescriberName: null, medications: [med, med] };
    assert.ok(toCorrectionBody({ ...base, confirmedByPatient: true }).medications.every((m) => (m as { confirmed?: boolean }).confirmed === true));
    assert.ok(toCorrectionBody(base).medications.every((m) => !("confirmed" in m)));
  });

  it("does not leak UI-only fields to the strict API schema", () => {
    const body = toCorrectionBody({ baseVersionNumber: 1, confirmedByPatient: true, prescriptionDate: null, prescriberName: null, medications: [med] });
    assert.deepEqual(Object.keys(body).sort(), ["baseVersionNumber", "medications", "prescriberName", "prescriptionDate"]);
  });
});
