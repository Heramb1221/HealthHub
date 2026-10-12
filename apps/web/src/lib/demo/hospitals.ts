import { ApiError } from "@/lib/api/errors";
import type { AppointmentsApi } from "@/lib/api/appointments";
import type { HospitalsApi } from "@/lib/api/hospitals";
import type { AdminHospitalsApi } from "@/lib/api/admin-hospitals";
import type { Appointment, AuthUser, AvailabilitySlot, Hospital, HospitalInput } from "@/lib/api/types";

import { currentUser, isSeeded, requirePatient } from "./records";

/**
 * DEMO ONLY. Typed stand-ins for /hospitals, /hospitals/:id/availability and /appointments.
 *
 * Every hospital here is synthetic and labelled as demo data. Slots are generated from fixed times relative to now.
 * Appointment state lives in ONE localStorage entry shared by every demo account in this browser, like a server would
 * share it, so a slot booked by one account (or in another tab) is genuinely gone for everyone else.
 * Booking and cancelling are each a single read-check-write step. The real guarantee against double booking is a
 * database transaction or unique constraint on the server; this only imitates its observable behaviour (409 on a lost race).
 */
const SEED_HOSPITALS: Hospital[] = [
  {
    id: "demo-hospital-1",
    name: "Demo City Hospital (sample)",
    city: "Demo City",
    address: "1 Sample Road, Demo City",
    phone: "+91 90000 00010",
    specialties: ["General medicine", "Paediatrics", "Orthopaedics"],
    active: true,
    isDemo: true,
  },
  {
    id: "demo-hospital-2",
    name: "Sample Lakeside Clinic (demo)",
    city: "Lakeside (sample)",
    address: "22 Example Lane, Lakeside",
    phone: "+91 90000 00011",
    specialties: ["Family medicine", "Dermatology"],
    active: true,
    isDemo: true,
  },
  {
    id: "demo-hospital-3",
    name: "Demo Riverside Medical Centre (sample)",
    city: "Riverside (sample)",
    address: "5 Placeholder Street, Riverside",
    phone: "+91 90000 00012",
    specialties: ["Cardiology", "General medicine"],
    active: true,
    isDemo: true,
  },
  {
    id: "demo-hospital-4",
    name: "Demo Closed Clinic (sample)",
    city: "Demo City",
    address: "9 Former Road, Demo City",
    phone: null,
    specialties: ["General medicine"],
    active: false,
    isDemo: true,
  },
];

const SLOT_TIMES: Record<string, string[]> = {
  "demo-hospital-1": ["09:30", "10:30", "11:30", "14:30", "15:30"],
  "demo-hospital-2": ["10:00", "11:00", "15:00"],
  "demo-hospital-3": ["09:00", "12:00", "16:00"],
};
/** Hospitals an administrator adds in demo mode get this sample schedule so booking can be tried end to end. */
const DEFAULT_TIMES = ["10:00", "11:00", "14:00"];
const SLOT_MINUTES = 30;
const DAYS_AHEAD = 14;
const MIN_LEAD_MS = 60 * 60 * 1000;
const SEEDED_USER_ID = "demo-patient";
const SEEDED_APPOINTMENT_ID = "demo-appt-1";

interface StoredAppointment extends Appointment {
  userId: string;
  slotId: string;
}
interface Store {
  appointments: StoredAppointment[];
  seededCancelled: boolean;
}

const KEY = "healthhub-demo-appointments:v1";

/**
 * Hospitals added or changed by the demo administrator, shared by every demo account in this browser (so a hospital
 * the admin adds is really what the patient sees). Seeded hospitals can be patched, never removed.
 */
const HOSPITALS_KEY = "healthhub-demo-hospitals:v1";
interface HospitalStore {
  created: Hospital[];
  patches: Record<string, Partial<Hospital>>;
}

function loadHospitals(): HospitalStore {
  try {
    const raw = window.localStorage.getItem(HOSPITALS_KEY);
    if (raw) return JSON.parse(raw) as HospitalStore;
  } catch {
    /* use empty store */
  }
  return { created: [], patches: {} };
}

function saveHospitals(store: HospitalStore) {
  try {
    window.localStorage.setItem(HOSPITALS_KEY, JSON.stringify(store));
  } catch {
    throw new ApiError({ code: "DEMO_UNSUPPORTED", message: "Demo mode needs browser storage, which is blocked in this browser.", status: 0 });
  }
}

function allHospitals(store: HospitalStore = loadHospitals()): Hospital[] {
  return [...SEED_HOSPITALS, ...store.created].map((h) => ({ ...h, ...(store.patches[h.id] ?? {}) }));
}

const timesFor = (hospitalId: string) => SLOT_TIMES[hospitalId] ?? DEFAULT_TIMES;

function load(): Store {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    /* use empty store */
  }
  return { appointments: [], seededCancelled: false };
}

function save(store: Store) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    throw new ApiError({ code: "DEMO_UNSUPPORTED", message: "Demo mode needs browser storage, which is blocked in this browser.", status: 0 });
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const slotIdFor = (hospitalId: string, day: string, time: string) => `${hospitalId}:${day}T${time}`;

function startOf(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
}

function toSlot(hospitalId: string, day: Date, time: string): AvailabilitySlot {
  const start = startOf(day, time);
  return {
    id: slotIdFor(hospitalId, dayKey(day), time),
    hospitalId,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + SLOT_MINUTES * 60_000).toISOString(),
  };
}

/** Every slot the schedule defines for a hospital, taken or not, that starts far enough ahead. */
function generatedSlots(hospitalId: string, now: Date): AvailabilitySlot[] {
  const out: AvailabilitySlot[] = [];
  for (let offset = 0; offset <= DAYS_AHEAD; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    for (const time of timesFor(hospitalId)) {
      const slot = toSlot(hospitalId, day, time);
      if (new Date(slot.startsAt).getTime() >= now.getTime() + MIN_LEAD_MS) out.push(slot);
    }
  }
  return out;
}

/** Some slots are deterministically "already taken by other patients" so the schedule looks lived-in and stays stable. */
function takenByOthers(slotId: string): boolean {
  let h = 0;
  for (const c of slotId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 4 === 0;
}

function seededAppointment(store: Store, now: Date): StoredAppointment {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3);
  const slot = toSlot("demo-hospital-1", day, "10:30");
  return {
    id: SEEDED_APPOINTMENT_ID,
    userId: SEEDED_USER_ID,
    slotId: slot.id,
    hospitalId: "demo-hospital-1",
    hospitalName: "Demo City Hospital (sample)",
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    status: store.seededCancelled ? "cancelled" : "booked",
    isDemo: true,
  };
}

function everyAppointment(store: Store, now: Date): StoredAppointment[] {
  return [seededAppointment(store, now), ...store.appointments];
}

function isTaken(slotId: string, store: Store, now: Date): boolean {
  return takenByOthers(slotId) || everyAppointment(store, now).some((a) => a.slotId === slotId && a.status === "booked");
}

/** What the API returns: the appointment without the demo store's internal bookkeeping fields. The hospital name is always the current one. */
function publicView(a: StoredAppointment): Appointment {
  const name = allHospitals().find((h) => h.id === a.hospitalId)?.name ?? a.hospitalName;
  return { id: a.id, hospitalId: a.hospitalId, hospitalName: name, startsAt: a.startsAt, endsAt: a.endsAt, status: a.status, isDemo: a.isDemo };
}

function mine(user: AuthUser, store: Store, now: Date): StoredAppointment[] {
  const own = store.appointments.filter((a) => a.userId === user.id);
  return [...(isSeeded(user) ? [seededAppointment(store, now)] : []), ...own].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** The server checks the role on every admin call. The demo does the same, so a patient session is refused. */
function requireAdmin(user: AuthUser) {
  if (user.role !== "admin") throw new ApiError({ code: "FORBIDDEN", message: "Only administrators can do this.", status: 403 });
}

function conflict(message: string): never {
  throw new ApiError({ code: "CONFLICT", message, status: 409 });
}
function notFound(message: string): never {
  throw new ApiError({ code: "NOT_FOUND", message, status: 404 });
}

export const demoHospitalsApi: HospitalsApi = {
  async list() {
    await currentUser();
    return allHospitals().filter((h) => h.active).sort((a, b) => a.name.localeCompare(b.name));
  },

  async listAll() {
    requireAdmin(await currentUser());
    return allHospitals().sort((a, b) => a.name.localeCompare(b.name));
  },

  async get(id) {
    await currentUser();
    return allHospitals().find((h) => h.id === id) ?? notFound("This hospital doesn’t exist or isn’t available.");
  },

  async availability(hospitalId) {
    await currentUser();
    const hospital = allHospitals().find((h) => h.id === hospitalId) ?? notFound("This hospital doesn’t exist or isn’t available.");
    if (!hospital.active) return [];
    const now = new Date();
    const store = load();
    return generatedSlots(hospitalId, now).filter((s) => !isTaken(s.id, store, now));
  },
};

export const demoAppointmentsApi: AppointmentsApi = {
  async list() {
    const user = await currentUser();
    requirePatient(user);
    const now = new Date();
    return mine(user, load(), now).map(publicView);
  },

  async book({ hospitalId, slotId }) {
    const user = await currentUser();
    requirePatient(user);
    const now = new Date();
    const hospital = allHospitals().find((h) => h.id === hospitalId) ?? notFound("This hospital doesn’t exist or isn’t available.");
    if (!hospital.active) conflict("This hospital isn’t accepting appointments.");

    // Read, check and write with no await in between, so the check and the claim can't be separated.
    const store = load();
    const slot = generatedSlots(hospitalId, now).find((s) => s.id === slotId);
    if (!slot) throw new ApiError({ code: "VALIDATION_ERROR", message: "That time isn’t available. Choose another.", status: 422 });
    if (isTaken(slot.id, store, now)) conflict("That time was just booked by someone else. Choose another time.");
    const start = new Date(slot.startsAt).getTime();
    const overlaps = mine(user, store, now).some((a) => a.status === "booked" && new Date(a.startsAt).getTime() === start);
    if (overlaps) conflict("You already have an appointment at this time.");

    const appointment: StoredAppointment = {
      id: `demo-appt-${crypto.randomUUID().slice(0, 8)}`,
      userId: user.id,
      slotId: slot.id,
      hospitalId,
      hospitalName: hospital.name,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status: "booked",
      isDemo: true,
    };
    store.appointments.push(appointment);
    save(store);
    return publicView(appointment);
  },

  async cancel(id) {
    const user = await currentUser();
    requirePatient(user);
    const now = new Date();
    const store = load();
    const found = mine(user, store, now).find((a) => a.id === id) ?? notFound("This appointment doesn’t exist or isn’t available to you.");
    if (found.status !== "booked") conflict("Only a booked appointment can be cancelled.");
    if (new Date(found.startsAt).getTime() <= now.getTime()) conflict("This appointment has already started, so it can’t be cancelled here.");

    if (found.id === SEEDED_APPOINTMENT_ID) store.seededCancelled = true;
    else store.appointments = store.appointments.map((a) => (a.id === id ? { ...a, status: "cancelled" as const } : a));
    save(store);
    return publicView({ ...found, status: "cancelled" });
  },
};

function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export const demoAdminHospitalsApi: AdminHospitalsApi = {
  async create(input: HospitalInput) {
    requireAdmin(await currentUser());
    const store = loadHospitals();
    if (allHospitals(store).some((h) => sameName(h.name, input.name))) conflict("A hospital with this name already exists.");
    const hospital: Hospital = { id: `demo-hospital-${crypto.randomUUID().slice(0, 8)}`, ...input, active: true, isDemo: true };
    store.created.push(hospital);
    saveHospitals(store);
    return hospital;
  },

  async update(id, input) {
    requireAdmin(await currentUser());
    const store = loadHospitals();
    const current = allHospitals(store).find((h) => h.id === id) ?? notFound("This hospital doesn’t exist.");
    if (input.name && allHospitals(store).some((h) => h.id !== id && sameName(h.name, input.name!))) conflict("A hospital with this name already exists.");
    const created = store.created.findIndex((h) => h.id === id);
    if (created >= 0) store.created[created] = { ...store.created[created], ...input };
    else store.patches[id] = { ...store.patches[id], ...input };
    saveHospitals(store);
    return { ...current, ...input };
  },

  async deactivate(id) {
    requireAdmin(await currentUser());
    const store = loadHospitals();
    const current = allHospitals(store).find((h) => h.id === id) ?? notFound("This hospital doesn’t exist.");
    const created = store.created.findIndex((h) => h.id === id);
    if (created >= 0) store.created[created] = { ...store.created[created], active: false };
    else store.patches[id] = { ...store.patches[id], active: false };
    saveHospitals(store);
    return { ...current, active: false };
  },
};
