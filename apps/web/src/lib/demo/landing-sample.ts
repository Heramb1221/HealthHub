import type { PrescriptionMedication } from "@/lib/api/types";

export const LANDING_SAMPLE_MEDICATIONS: PrescriptionMedication[] = [
  {
    name: "Paracetamol",
    strength: "500 mg",
    dose: "1 tablet",
    route: null,
    frequency: "Twice a day",
    duration: null,
    instructions: null,
    confidence: 0.97,
  },
  {
    name: "Amoxicillin",
    strength: "250 mg",
    dose: "1 capsule",
    route: null,
    frequency: null,
    duration: null,
    instructions: null,
    confidence: 0.62,
  },
];
