import { ApiError } from "@/lib/api/errors";
import type { HistoryApi } from "@/lib/api/history";
import type { HistoryEntry } from "@/lib/api/types";

import { demoPrescriptionsApi } from "./prescriptions";
import { currentUser, isSeeded, requirePatient } from "./records";

/**
 * DEMO ONLY. Typed stand-in for /health-history.
 * - Conditions are patient-reported and always stored as unverified.
 * - Prescription entries are derived from the prescription records, so their verification status always matches.
 * - One seeded condition for the demo patient; conditions you add are kept in this browser.
 */
const key = (userId: string) => `healthhub-demo-history:v1:${userId}`;

function load(userId: string): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (raw) return JSON.parse(raw) as HistoryEntry[];
  } catch {
    /* use empty list */
  }
  return [];
}

export const demoHistoryApi: HistoryApi = {
  async list() {
    const user = await currentUser();
    requirePatient(user);
    const prescriptions = await demoPrescriptionsApi.list();

    const derived: HistoryEntry[] = prescriptions.map((rx) => ({
      id: `hist-${rx.id}`,
      kind: "prescription",
      title: rx.processingStatus === "completed" ? `Prescription added: ${rx.medications.map((m) => m.name ?? "unnamed").join(", ") || "no medicines found"}` : "Prescription uploaded",
      description: rx.prescriberName ? `Prescribed by ${rx.prescriberName}.` : null,
      occurredOn: rx.prescriptionDate ?? rx.createdAt.slice(0, 10),
      source: "prescription_scan",
      verificationStatus: rx.verificationStatus,
      relatedPrescriptionId: rx.id,
      createdAt: rx.createdAt,
      isDemo: true,
    }));

    const seeded: HistoryEntry[] = isSeeded(user)
      ? [
          {
            id: "hist-demo-condition-1",
            kind: "condition",
            title: "Seasonal rhinitis",
            description: "Sample entry for the demo patient.",
            occurredOn: "2019-03-01",
            source: "patient_reported",
            verificationStatus: "unverified",
            relatedPrescriptionId: null,
            createdAt: "2019-03-01T00:00:00.000Z",
            isDemo: true,
          },
        ]
      : [];

    return [...derived, ...seeded, ...load(user.id)].sort((a, b) => (b.occurredOn ?? b.createdAt).localeCompare(a.occurredOn ?? a.createdAt));
  },

  async addCondition(input) {
    const user = await currentUser();
    requirePatient(user);
    const entries = load(user.id);
    if (entries.some((e) => e.title.toLowerCase() === input.name.trim().toLowerCase())) {
      throw new ApiError({ code: "CONFLICT", message: `${input.name} is already in your history.`, status: 409 });
    }
    const entry: HistoryEntry = {
      id: `hist-${crypto.randomUUID().slice(0, 8)}`,
      kind: "condition",
      title: input.name.trim(),
      description: input.notes,
      occurredOn: input.diagnosedOn,
      source: "patient_reported",
      verificationStatus: "unverified",
      relatedPrescriptionId: null,
      createdAt: new Date().toISOString(),
      isDemo: true,
    };
    try {
      window.localStorage.setItem(key(user.id), JSON.stringify([...entries, entry]));
    } catch {
      throw new ApiError({ code: "DEMO_UNSUPPORTED", message: "Demo mode needs browser storage, which is blocked in this browser.", status: 0 });
    }
    return entry;
  },
};
