import { describe, expect, it } from "vitest";
import { bookAppointmentSchema } from "../src/modules/appointments/schemas.js";
import { addConditionSchema } from "../src/modules/history/schemas.js";

// These document the exact payloads the website and mobile app must send. The API rejects unknown keys.
describe("API write contracts are strict", () => {
  const slotId = "6f1c2f0e-3b52-4f4b-9a5e-0d6e0c1d7a11";

  it("booking accepts { slotId } and rejects { hospitalId, slotId }", () => {
    expect(bookAppointmentSchema.safeParse({ slotId }).success).toBe(true);
    expect(bookAppointmentSchema.safeParse({ hospitalId: "h", slotId }).success).toBe(false);
  });

  it("history condition accepts { title } and rejects { name }", () => {
    expect(addConditionSchema.safeParse({ title: "Asthma", diagnosedOn: null, notes: null }).success).toBe(true);
    expect(addConditionSchema.safeParse({ name: "Asthma", diagnosedOn: null, notes: null }).success).toBe(false);
  });
});

import { correctionSchema } from "../src/modules/prescriptions/corrections.js";

describe("prescription correction contract (what the website sends)", () => {
  const med = { name: "Paracetamol", strength: "500 mg", dose: null, route: null, frequency: "1-0-1", duration: "5 days", instructions: null, confirmed: true };

  it("accepts the website's body, including nulls and per-row confirmation", () => {
    const body = { baseVersionNumber: 2, prescriptionDate: "2026-10-14", prescriberName: "Dr. Anjali Deshmukh", medications: [med] };
    expect(correctionSchema.safeParse(body).success).toBe(true);
  });

  it("rejects the body the website used to send (no baseVersionNumber)", () => {
    const { ...legacy } = { prescriptionDate: "2026-10-14", prescriberName: "Dr. A", medications: [med] };
    expect(correctionSchema.safeParse(legacy).success).toBe(false);
  });
});
