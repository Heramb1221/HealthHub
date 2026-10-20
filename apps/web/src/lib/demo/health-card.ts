import type { HealthCardApi } from "@/lib/api/health-card";
import type { HealthCard } from "@/lib/api/types";

import { currentUser, demoPatientsApi, requirePatient } from "./records";

const key = (userId: string) => `healthhub-demo-qr:v1:${userId}`;
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function randomReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return `q_${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

function stored(userId: string): { reference: string; issuedAt: string } {
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (raw) return JSON.parse(raw) as { reference: string; issuedAt: string };
  } catch {

  }
  const fresh = { reference: randomReference(), issuedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(fresh));
  } catch {

  }
  return fresh;
}

export const demoHealthCardApi: HealthCardApi = {
  async get(): Promise<HealthCard> {
    const user = await currentUser();
    requirePatient(user);
    const patient = await demoPatientsApi.getMe();
    const { reference, issuedAt } = stored(user.id);
    return {
      healthId: patient.healthId,
      fullName: patient.fullName,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender,
      bloodGroup: patient.bloodGroup,
      phone: patient.phone,
      emergencyContactName: patient.emergencyContact?.name ?? null,
      emergencyContactPhone: patient.emergencyContact?.phone ?? null,
      issuer: "Sehat Med · Ministry of Health & Family Welfare",
      notice: "Valid for medical triage & emergency clinical authentication.",
      issuedAt,
      qr: { reference, url: `${window.location.origin}/qr/${reference}` },
      isDemo: true,
    };
  },
};
