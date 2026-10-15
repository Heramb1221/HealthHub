export const MEDICATION_FIELDS = ["name", "strength", "dose", "route", "frequency", "duration", "instructions"] as const;
export type MedicationField = (typeof MEDICATION_FIELDS)[number];

export type MedicationFields = Record<MedicationField, string | null>;

export interface VersionContent {
  prescriptionDate: string | null;
  prescriberName: string | null;
  medications: MedicationFields[];
}

/** True when every text field of the two rows is identical. Confidence is not compared. */
export function sameMedication(a: MedicationFields, b: MedicationFields): boolean {
  return MEDICATION_FIELDS.every((field) => a[field] === b[field]);
}

/**
 * Names of what changed between two versions, never the values themselves, so
 * the result is safe to store in the audit log and the version history.
 * Rows are compared by position:
 *   prescriptionDate, prescriberName, medications.<i>.<field>,
 *   medications.<i>.added, medications.<i>.removed
 */
export function diffVersions(previous: VersionContent, next: VersionContent): string[] {
  const changed: string[] = [];
  if (previous.prescriptionDate !== next.prescriptionDate) changed.push("prescriptionDate");
  if (previous.prescriberName !== next.prescriberName) changed.push("prescriberName");

  const rows = Math.max(previous.medications.length, next.medications.length);
  for (let i = 0; i < rows; i += 1) {
    const before = previous.medications[i];
    const after = next.medications[i];
    if (before && !after) changed.push(`medications.${i}.removed`);
    else if (!before && after) changed.push(`medications.${i}.added`);
    else if (before && after) {
      for (const field of MEDICATION_FIELDS) {
        if (before[field] !== after[field]) changed.push(`medications.${i}.${field}`);
      }
    }
  }
  return changed;
}
