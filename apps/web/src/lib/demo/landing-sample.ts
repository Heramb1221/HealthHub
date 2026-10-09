import type { PrescriptionMedication } from "@/lib/api/types";

/**
 * ILLUSTRATION ONLY. Two invented rows used on the public landing page to show how HealthHub marks
 * what it could and could not read. Not a real prescription, patient or dosing recommendation.
 * Review status on the page is computed by lib/prescription-safety.ts, the same rule the app uses.
 */
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
