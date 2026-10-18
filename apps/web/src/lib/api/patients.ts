
import { request } from "./http";
import type { Patient, UpdatePatientInput } from "./types";

export interface PatientsApi {
  getMe(): Promise<Patient>;
  updateMe(input: UpdatePatientInput): Promise<Patient>;
}

function normalizePatient(data: unknown): Patient {
  const p = (data ?? {}) as Record<string, unknown>;
  const conditions = (p.conditions ?? p.existingConditions ?? []) as string[];
  const ec = (p.emergencyContact ?? {}) as Record<string, unknown>;
  return {
    ...(p as unknown as Patient),
    email: (p.email as string | null) ?? null,
    conditions: Array.isArray(conditions) ? conditions : [],
    allergies: Array.isArray(p.allergies) ? (p.allergies as string[]) : [],
    currentMedications: Array.isArray(p.currentMedications) ? (p.currentMedications as string[]) : [],
    emergencyContact: {
      name: (ec.name as string | null) ?? null,
      relationship: (ec.relationship as string | null) ?? null,
      phone: (ec.phone as string | null) ?? null,
    },
  };
}

function cleanStr(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val === "string") {
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return String(val);
}

const livePatientsApi: PatientsApi = {
  getMe: async () => normalizePatient(await request<Patient>("/patients/me")),
  updateMe: async (input) => {
    const payload: Record<string, unknown> = {};
    if (input.fullName !== undefined) {
      const clean = cleanStr(input.fullName);
      if (clean) payload.fullName = clean;
    }
    if (input.dateOfBirth !== undefined) payload.dateOfBirth = cleanStr(input.dateOfBirth);
    if (input.gender !== undefined) payload.gender = cleanStr(input.gender);
    if (input.bloodGroup !== undefined) payload.bloodGroup = cleanStr(input.bloodGroup);
    if (input.phone !== undefined) payload.phone = cleanStr(input.phone);
    if (input.address !== undefined) payload.address = cleanStr(input.address);
    if (input.allergies !== undefined) {
      payload.allergies = Array.isArray(input.allergies)
        ? input.allergies.map(String).map((s) => s.trim()).filter(Boolean)
        : [];
    }
    if (input.currentMedications !== undefined) {
      payload.currentMedications = Array.isArray(input.currentMedications)
        ? input.currentMedications.map(String).map((s) => s.trim()).filter(Boolean)
        : [];
    }

    const conditions = (input as { conditions?: string[]; existingConditions?: string[] }).conditions ??
                       (input as { existingConditions?: string[] }).existingConditions;
    if (conditions !== undefined) {
      payload.existingConditions = Array.isArray(conditions)
        ? conditions.map(String).map((s) => s.trim()).filter(Boolean)
        : [];
    }

    if (input.emergencyContact) {
      const name = cleanStr(input.emergencyContact.name);
      const relationship = cleanStr(input.emergencyContact.relationship);
      const phone = cleanStr(input.emergencyContact.phone);
      payload.emergencyContact = { name, relationship, phone };
    }

    const res = await request<Patient>("/patients/me", { method: "PATCH", json: payload });
    return normalizePatient(res);
  },
};

export const patientsApi: PatientsApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? livePatientsApi
    : // Required only in demo builds, so demo accounts and sample data never ship in a live bundle (see README).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/records") as typeof import("@/lib/demo/records")).demoPatientsApi;
