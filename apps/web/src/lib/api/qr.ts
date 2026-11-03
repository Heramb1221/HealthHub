import { request } from "./http";
import type { Prescription } from "./types";

export interface EmergencySummary {
  healthId: string;
  fullName: string | null;
  bloodGroup: string | null;
  criticalAllergies: string[];
  emergencyContact: { name: string | null; relationship: string | null; phone: string | null };
  notice: string;
}

export interface SharedPrescription {
  session: { id: string; expiresAt: string };
  prescription: Prescription;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEALTH_ID = /^HH-[A-Za-z0-9]{8}$/;

/** What a scanned `/qr/<reference>` value is. Anything else is not a Sehat Meds QR. */
export function classifyQrReference(reference: string): "session" | "emergency" | "invalid" {
  if (UUID.test(reference)) return "session";
  if (HEALTH_ID.test(reference)) return "emergency";
  return "invalid";
}

export const qrApi = {
  emergency: (healthId: string, signal?: AbortSignal) => request<EmergencySummary>(`/qr/emergency/${encodeURIComponent(healthId)}`, { signal }),
  sharedPrescription: (sessionId: string, signal?: AbortSignal) =>
    request<SharedPrescription>(`/qr/access-sessions/${encodeURIComponent(sessionId)}`, { signal }),
};
