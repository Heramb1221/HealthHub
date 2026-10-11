import type { PrescriptionMedication, PrescriptionVersion } from "@/lib/api/types";

export type MedicationField = "name" | "strength" | "dose" | "route" | "frequency" | "duration" | "instructions";

export const FIELD_LABEL: Record<MedicationField, string> = {
  name: "Medicine",
  strength: "Strength",
  dose: "Dose",
  route: "Route",
  frequency: "How often",
  duration: "Duration",
  instructions: "Instructions",
};

const FIELDS = Object.keys(FIELD_LABEL) as MedicationField[];

export interface Change {
  kind: "added" | "removed" | "changed";
  medication: string;
  field?: MedicationField;
  before?: string | null;
  after?: string | null;
}

/** Medicines are matched by name (case-insensitive). A renamed medicine shows as removed + added, which is the safe reading. */
function key(m: PrescriptionMedication) {
  return (m.name ?? "").trim().toLowerCase();
}

/** What changed between two versions. Previous values are always shown, never overwritten. */
export function diffVersions(previous: PrescriptionVersion | null, next: PrescriptionVersion): Change[] {
  if (!previous) return [];
  const changes: Change[] = [];
  const before = new Map(previous.medications.map((m) => [key(m), m]));
  const after = new Map(next.medications.map((m) => [key(m), m]));

  for (const [k, m] of after) {
    const old = before.get(k);
    if (!old) {
      changes.push({ kind: "added", medication: m.name ?? "Unnamed medicine" });
      continue;
    }
    for (const field of FIELDS) {
      if ((old[field] ?? null) !== (m[field] ?? null)) {
        changes.push({ kind: "changed", medication: m.name ?? "Unnamed medicine", field, before: old[field] ?? null, after: m[field] ?? null });
      }
    }
  }
  for (const [k, m] of before) {
    if (!after.has(k)) changes.push({ kind: "removed", medication: m.name ?? "Unnamed medicine" });
  }

  if ((previous.prescriberName ?? null) !== (next.prescriberName ?? null)) {
    changes.push({ kind: "changed", medication: "Prescription", field: undefined, before: previous.prescriberName, after: next.prescriberName });
  }
  return changes;
}
