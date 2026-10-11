import { ApiError } from "@/lib/api/errors";
import type { Appointment, AuthUser, Patient, UpdatePatientInput } from "@/lib/api/types";
import { demoAuthApi } from "@/lib/demo/auth";

/**
 * DEMO ONLY. Typed stand-ins for the patient, prescription, appointment and schedule endpoints.
 *
 * - Every record carries `isDemo: true` so the UI labels it in place.
 * - Only the seeded account "demo-patient" has sample data. Newly registered demo users start with an
 *   empty record so empty states are real. The admin demo account has no patient profile (404).
 * - Dates are generated relative to "now" on each read so the sample never goes stale.
 * - The only thing persisted is what the user edits (their profile), in this browser's localStorage.
 */
const SEEDED_USER_ID = "demo-patient";

export async function currentUser(): Promise<AuthUser> {
  const user = await demoAuthApi.getSession();
  if (!user) throw new ApiError({ code: "UNAUTHENTICATED", message: "Your session has ended. Sign in again to continue.", status: 401 });
  return user;
}

export function requirePatient(user: AuthUser) {
  if (user.role !== "patient") {
    throw new ApiError({ code: "NOT_FOUND", message: "This account has no patient profile.", status: 404 });
  }
}

const storageKey = (userId: string) => `healthhub-demo-db:v1:${userId}`;

function readPatientOverride(userId: string): Patient | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as Patient) : null;
  } catch {
    return null;
  }
}

function writePatient(userId: string, patient: Patient) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(patient));
  } catch {
    throw new ApiError({ code: "DEMO_UNSUPPORTED", message: "Demo mode needs browser storage, which is blocked in this browser.", status: 0 });
  }
}

/** Random, non-meaningful ID without look-alike characters (spec: HealthHub ID carries no meaning). */
function randomHealthId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `HH-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

function seededPatient(): Patient {
  return {
    id: "demo-patient-record",
    healthId: "HH-4F7K-9QXM",
    fullName: "Demo Patient",
    dateOfBirth: "1990-01-15",
    gender: "female",
    bloodGroup: "O+",
    phone: "+91 90000 00000",
    email: "demo.patient@healthhub.test",
    address: "Sample address, Demo City",
    emergencyContact: { name: "Demo Contact", relationship: "Sibling", phone: "+91 90000 00001" },
    allergies: ["Dust (sample entry)"],
    conditions: ["Seasonal rhinitis (sample entry)"],
    currentMedications: ["Cetirizine 10 mg (sample entry)"],
    isDemo: true,
  };
}

function blankPatient(user: AuthUser): Patient {
  return {
    id: `${user.id}-record`,
    healthId: randomHealthId(),
    fullName: user.displayName ?? "",
    dateOfBirth: null,
    gender: null,
    bloodGroup: null,
    phone: null,
    email: user.email,
    address: null,
    emergencyContact: { name: null, relationship: null, phone: null },
    allergies: [],
    conditions: [],
    currentMedications: [],
    isDemo: true,
  };
}

export const demoPatientsApi = {
  async getMe(): Promise<Patient> {
    const user = await currentUser();
    requirePatient(user);
    const stored = readPatientOverride(user.id);
    if (stored) return stored;
    const patient = user.id === SEEDED_USER_ID ? seededPatient() : blankPatient(user);
    // Persist so a new user's random HealthHub ID stays stable across reloads.
    writePatient(user.id, patient);
    return patient;
  },
  async updateMe(input: UpdatePatientInput): Promise<Patient> {
    const user = await currentUser();
    requirePatient(user);
    const current = await demoPatientsApi.getMe();
    const next: Patient = { ...current, ...input, emergencyContact: { ...current.emergencyContact, ...input.emergencyContact } };
    writePatient(user.id, next);
    return next;
  },
};

export function isSeeded(user: AuthUser) {
  return user.id === SEEDED_USER_ID;
}

export const demoAppointmentsApi = {
  async list(): Promise<Appointment[]> {
    const user = await currentUser();
    requirePatient(user);
    if (!isSeeded(user)) return [];
    const when = new Date();
    when.setDate(when.getDate() + 3);
    when.setHours(10, 30, 0, 0);
    return [{ id: "demo-appt-1", hospitalId: "demo-hospital-1", hospitalName: "Demo City Hospital (sample)", startsAt: when.toISOString(), status: "booked", isDemo: true }];
  },
};
