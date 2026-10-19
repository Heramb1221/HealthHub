import type { HealthCardApi } from "@/lib/api/health-card";
import type { HealthCard } from "@/lib/api/types";

import { currentUser, demoPatientsApi, requirePatient } from "./records";

/**
 * DEMO ONLY. Typed stand-in for GET /patients/me/health-card.
 *
 * The QR reference is random and stored per demo user in this browser, so it stays the same across reloads.
 * It points at this app's own public /qr/<reference> page, which explains the protected access flow and shows
 * no medical data. Nothing here resolves a reference to a person: there is no access-session service in demo mode.
 */
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
    /* fall through and issue a new reference */
  }
  const fresh = { reference: randomReference(), issuedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(fresh));
  } catch {
    /* the card still renders; it just won't be stable across reloads */
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
