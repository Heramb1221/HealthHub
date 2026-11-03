import { describe, expect, it } from "vitest";
import { normalizeExtraction } from "../src/modules/prescriptions/safetyGate.js";
import { findDate, findPrescriber, LOCAL_CONFIDENCE_CAP, parsePrescriptionText, type OcrLine } from "../src/extraction/textParser.js";

const lines = (text: string, confidence = 90): OcrLine[] => text.split("\n").map((t) => ({ text: t, confidence }));

// Real tesseract output for a synthetic printed prescription.
const CLEAN = `CITY CARE CLINIC & DIAGNOSTICS
12 MG Road, Shirpur, Maharashtra | Ph: 02563 245678
Dr. Anjali Deshmukh Date: 14/10/2026
MBBS, MD (Medicine) Reg. No. MMC-2014/08/3321
Patient: Ramesh Patil Age/Sex: 54 | M

1) Tab. Paracetamol 500 mg 1-0-1 x 5 days after food

2) Cap. Amoxicillin 250 mg 1-1-1 x 7 days

3) Tab. Pantoprazole 40 mg 1-0-0 x 10 days before breakfast

4) Syp. Cetirizine 5 ml 0-0-1 x 3 days

5) Tab. Metformin 500 mg twice a day x 30 days
Advice: Drink plenty of fluids. Review after 1 week.

Dr. Anjali Deshmukh`;

// Real tesseract output for the same prescription photographed at an angle with noise.
const PHOTO = `CITY CARE CLINIC & DIAGNOSTICS
12 MG Road, Shirpur, Maharashtra | Ph: 02563 245678
Dr. Anjali peshmukh Date: 14/10/2026
MBBS, MD (Medicine) Reg. No. MMC-2014/08/3321
patient: Ramesh patil Age/Sex: 54 IM

1) Tab. paracetamol 500 mg 1.0-1 x 5 days after food

2) Cap. Amoxicillin 250 mg 1-1-1 x7 days

3) Tab. pantoprazole 40 mg 1-0-0 x 10 days before breakfast

Advice: Drink plenty of fluids. Review after 1 week.
Dr. Anjali Deshmukh`;

describe("parsePrescriptionText: clean printed prescription", () => {
  const out = parsePrescriptionText(lines(CLEAN), 94);

  it("reads date and prescriber exactly as printed", () => {
    expect(out.prescriptionDate).toBe("2026-10-14");
    expect(out.prescriberName).toBe("Dr. Anjali Deshmukh");
  });

  it("reads every medicine row with fields exactly as written", () => {
    expect(out.medications.map((m) => m.name)).toEqual(["Paracetamol", "Amoxicillin", "Pantoprazole", "Cetirizine", "Metformin"]);
    const [para, amox, panto, cetir, metf] = out.medications;
    expect(para).toMatchObject({ strength: "500 mg", frequency: "1-0-1", duration: "5 days", instructions: "after food", dose: null });
    expect(amox).toMatchObject({ strength: "250 mg", frequency: "1-1-1", duration: "7 days" });
    expect(panto).toMatchObject({ frequency: "1-0-0", duration: "10 days", instructions: "before breakfast" });
    expect(metf).toMatchObject({ frequency: "twice a day", duration: "30 days" });
    // "5 ml" is a volume dose, not a strength.
    expect(cetir).toMatchObject({ strength: null, dose: "5 ml", frequency: "0-0-1" });
  });

  it("never invents a dose from the 1-0-1 notation", () => {
    expect(out.medications.every((m) => m.dose === null || /ml|tab|cap|drop|puff|tsp|unit/i.test(m.dose))).toBe(true);
    expect(out.medications[0]?.dose).toBeNull();
  });

  it("is never confident enough to skip review, and the safety gate agrees", () => {
    expect(out.overallConfidence).toBeLessThanOrEqual(LOCAL_CONFIDENCE_CAP);
    expect(out.medications.every((m) => m.confidence <= LOCAL_CONFIDENCE_CAP)).toBe(true);
    const gated = normalizeExtraction(out);
    expect(gated.ok && gated.value.verificationStatus).toBe("needs_review");
  });
});

describe("parsePrescriptionText: noisy phone photo", () => {
  const out = parsePrescriptionText(lines(PHOTO, 80), 91);

  it("prefers the properly-spelled prescriber that appears in the document", () => {
    expect(out.prescriberName).toBe("Dr. Anjali Deshmukh");
  });

  it("leaves a garbled frequency empty instead of guessing ('1.0-1' is not '1-0-1')", () => {
    const para = out.medications.find((m) => m.name?.toLowerCase() === "paracetamol");
    expect(para?.frequency).toBeNull();
    const gated = normalizeExtraction(out);
    expect(gated.ok && gated.value.reviewReasons).toContain("missing_critical_field");
  });

  it("still reads 'x7 days'", () => {
    expect(out.medications.find((m) => m.name === "Amoxicillin")?.duration).toBe("7 days");
  });
});

describe("prescriber detection never returns the wrong kind of name", () => {
  it("ignores the patient, even when they are called Dr.", () => {
    const l = lines("Patient: Dr. Ravi Kulkarni  Age: 40\nDr. Meera Joshi MBBS\n1) Tab. Paracetamol 500 mg 1-0-1");
    expect(findPrescriber(l)).toBe("Dr. Meera Joshi");
  });

  it("returns null when the only 'Dr.' is a clinic, hospital or pharmacy", () => {
    expect(findPrescriber(lines("Dr. Sharma Clinic\nDr. Mehta's Hospital\nDr. Reddy Pharmacy"))).toBeNull();
  });

  it("returns null rather than guessing when there is no doctor at all", () => {
    expect(findPrescriber(lines("City Hospital\nPatient: Asha\nTab. Paracetamol 500 mg"))).toBeNull();
  });

  it("stops at qualifications, registration numbers and dates on the same line", () => {
    expect(findPrescriber(lines("Dr. Sunil Kumar MBBS MD Reg 12345"))).toBe("Dr. Sunil Kumar");
    expect(findPrescriber(lines("Dr S. R. Iyer  Date: 12/01/2026"))).toBe("Dr. S. R. Iyer");
  });
});

describe("dates", () => {
  it("reads day-first numeric dates and written months", () => {
    expect(findDate("Date: 05/03/2026")).toBe("2026-03-05");
    expect(findDate("05-03-26")).toBe("2026-03-05");
    expect(findDate("2026-03-05")).toBe("2026-03-05");
    expect(findDate("5 Mar 2026")).toBe("2026-03-05");
    expect(findDate("March 5, 2026")).toBe("2026-03-05");
  });
  it("rejects impossible dates", () => {
    expect(findDate("31/02/2026")).toBeNull();
    expect(findDate("45/13/2026")).toBeNull();
  });
  it("does not use a birth date or follow-up date as the prescription date", () => {
    const out = parsePrescriptionText(lines("DOB: 01/01/1980\nReview on 20/11/2026\nDate: 14/10/2026\n1) Tab. Paracetamol 500 mg 1-0-1"));
    expect(out.prescriptionDate).toBe("2026-10-14");
    const none = parsePrescriptionText(lines("DOB: 01/01/1980\nReview on 20/11/2026"));
    expect(none.prescriptionDate).toBeNull();
  });
});

describe("non-prescriptions and edge cases", () => {
  it("returns no medicines and very low confidence for unrelated text", () => {
    const out = parsePrescriptionText(lines("Grocery list: milk, eggs, bread\nCapital Hospital annual report 2025"), 70);
    expect(out.medications).toEqual([]);
    expect(out.overallConfidence).toBeLessThan(0.2);
    const gated = normalizeExtraction(out);
    expect(gated.ok && gated.value.reviewReasons).toContain("no_medications");
  });

  it("returns nothing for empty OCR output", () => {
    expect(parsePrescriptionText([]).medications).toEqual([]);
  });

  it("joins a wrapped instruction line to the medicine above it", () => {
    const out = parsePrescriptionText(lines("1) Tab. Metformin 500 mg 1-0-1 x 30 days\nafter food"));
    expect(out.medications[0]?.instructions).toBe("after food");
  });

  it("does not duplicate a medicine listed twice identically", () => {
    const out = parsePrescriptionText(lines("1) Tab. Paracetamol 500 mg 1-0-1\n2) Tab. Paracetamol 500 mg 1-0-1"));
    expect(out.medications).toHaveLength(1);
  });

  it("does not treat words that merely start with a dosage form as medicines", () => {
    const out = parsePrescriptionText(lines("Capital Hospital\nTablet Corner Pharmacy\nGelato Road"));
    expect(out.medications.every((m) => m.name !== "Capital Hospital")).toBe(true);
  });
});
