import { demoNameFor } from "./accounts.ts";

/**
 * DEMO MODE: an in-memory stand-in for the HealthHub API, used only when the app runs without a server.
 *
 * - It is clearly labelled in the UI (persistent "Demo mode" banner) and never persists anything.
 * - All data is synthetic and fictional. Uploaded files are NOT read or sent anywhere: processing returns a
 *   fixed synthetic fixture chosen by file name ("illegible" fails, "ambiguous" needs review, anything else is a
 *   clear fixture). This mirrors the backend mock provider's refusal to invent medicines for real documents.
 * - It follows the backend's implemented rules (CONTRACT_DECISIONS.md F-I) and proposed shapes (B1-B5) so the same
 *   client code paths run in demo and live mode. Where the backend has not decided a shape, it uses the mobile
 *   assumptions in docs/MOBILE_CONTRACT_ASSUMPTIONS.md.
 * - No React Native imports, so it is unit-tested in Node.
 */
export const DEMO_BASE_URL = "https://demo.healthhub.invalid/api/v1";

type Json = Record<string, unknown>;

interface Med {
  name: string | null;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  confidence: number;
}
interface Version {
  id: string;
  prescriptionId: string;
  versionNumber: number;
  kind: "extraction" | "patient_correction";
  verificationStatus: string;
  extractionProvider: string | null;
  extractionConfidence: number | null;
  prescriptionDate: string | null;
  prescriberName: string | null;
  medications: Med[];
  changedFields: string[];
  createdAt: string;
}
interface Rx {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  fileName: string;
  createdAt: string;
  versions: Version[];
}
interface DemoDose {
  id: string;
  scheduledFor: string;
  status: "taken" | "skipped";
  recordedAt: string;
}
interface Schedule {
  id: string;
  prescriptionId: string;
  position: number;
  sourceVersionNumber: number;
  /** Copy of the prescription row at creation (backend K1): never edited afterwards. */
  med: Omit<Med, "confidence">;
  startDate: string;
  endDate: string | null;
  reminderTimes: string[];
  remindersEnabled: boolean;
  timezone: string;
  isActive: boolean;
  doses: DemoDose[];
  createdAt: string;
  updatedAt: string;
}
interface Slot {
  id: string;
  hospitalId: string;
  startsAt: string;
  endsAt: string;
  booked: boolean;
}
interface Appt {
  id: string;
  slotId: string;
  status: "confirmed" | "cancelled";
  cancelledAt: string | null;
  createdAt: string;
}
interface QrSess {
  prescriptionId: string;
  expiresAt: number;
  revokedAt: string | null;
  createdAt: string;
}

const HOSPITALS = [
  { id: "demo-h1", name: "Demo City Hospital", city: "Pune", address: "1 Sample Road (demo)", phone: "+91 20 0000 0001", specialties: ["General medicine", "Cardiology"] },
  { id: "demo-h2", name: "Example Care Clinic", city: "Nashik", address: "22 Test Lane (demo)", phone: "+91 253 000 0002", specialties: ["Family medicine"] },
  { id: "demo-h3", name: "Sample Children's Centre", city: "Mumbai", address: "3 Fictional Street (demo)", phone: null, specialties: ["Paediatrics"] },
];

let counter = 0;
const nextId = (prefix: string): string => `${prefix}-${++counter}`;
const iso = (d: Date): string => d.toISOString();
const dateKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

interface State {
  registered: Set<string>;
  email: string;
  token: string | null;
  patient: Json & { healthId: string; emergencyContact: { name: string | null; phone: string | null } };
  rxs: Rx[];
  schedules: Schedule[];
  history: Json[];
  access: Json[];
  consents: Json[];
  qr: Map<string, QrSess>;
  slots: Slot[];
  appts: Appt[];
}

let state: State = freshState();

/** Test helper and "start over" on sign-out. */
export function resetDemo(): void {
  counter = 0;
  state = freshState();
}

function med(name: string, strength: string | null, dose: string | null, frequency: string | null, duration: string | null, confidence: number): Med {
  return { name, strength, dose, route: dose ? "by mouth" : null, frequency, duration, instructions: null, confidence };
}

function fixture(kind: "clear" | "ambiguous"): { meds: Med[]; date: string; prescriber: string; status: string } {
  const date = dateKey(new Date(Date.now() - 2 * 86_400_000));
  if (kind === "clear") {
    return { meds: [med("Mockapril", "5 mg", "1 tablet", "once a day", "30 days", 0.95)], date, prescriber: "Dr. Example Sample", status: "unverified" };
  }
  return {
    meds: [med("Examplin", "500 mg", "1 tablet", "twice a day", "5 days", 0.93), med("Testamine", "10 mg", null, null, "7 days", 0.62)],
    date,
    prescriber: "Dr. Demo Person",
    status: "needs_review",
  };
}

function version(prescriptionId: string, n: number, kind: Version["kind"], status: string, date: string | null, prescriber: string | null, meds: Med[], changed: string[]): Version {
  return {
    id: nextId("demo-v"),
    prescriptionId,
    versionNumber: n,
    kind,
    verificationStatus: status,
    extractionProvider: kind === "extraction" ? "demo-synthetic" : null,
    extractionConfidence: kind === "extraction" ? 0.9 : null,
    prescriptionDate: date,
    prescriberName: prescriber,
    medications: meds,
    changedFields: changed,
    createdAt: iso(new Date()),
  };
}

function freshState(): State {
  const s: State = {
    registered: new Set(),
    email: "",
    token: null,
    patient: {
      id: "demo-patient",
      healthId: "HH-DEMO7K2M",
      fullName: "Asha Demo",
      dateOfBirth: "1990-01-15",
      gender: "female",
      bloodGroup: "B+",
      phone: "+91 90000 00000",
      emergencyContact: { name: "Demo Contact", phone: "+91 90000 00001" },
      allergies: ["Dust (demo entry)"],
      existingConditions: [],
      currentMedications: [],
      address: null,
      createdAt: iso(new Date()),
      updatedAt: iso(new Date()),
    },
    rxs: [],
    schedules: [],
    history: [
      { id: "demo-hist-1", title: "Seasonal allergy (demo entry)", kind: "condition", notes: "Sample entry reported by the patient.", diagnosedOn: null, createdAt: iso(new Date(Date.now() - 30 * 86_400_000)), source: "patient_reported", verificationStatus: "unverified" },
    ],
    access: [
      { id: "demo-a1", occurredAt: iso(new Date(Date.now() - 86_400_000)), action: "patient.profile_updated", outcome: "success", actor: { type: "self" }, resourceType: "patient", details: { changedFields: ["phone"] } },
    ],
    consents: [
      { id: "demo-consent-1", patientId: "demo-patient", granteeUserId: "demo-provider-0001", resourceScope: "prescriptions:read", purpose: "Follow-up visit (demo)", expiresAt: iso(new Date(Date.now() + 30 * 86_400_000)), revokedAt: null, createdAt: iso(new Date(Date.now() - 3 * 86_400_000)) },
      { id: "demo-consent-2", patientId: "demo-patient", granteeUserId: "demo-provider-0002", resourceScope: "health_history:read", purpose: "Second opinion (demo)", expiresAt: null, revokedAt: null, createdAt: iso(new Date(Date.now() - 10 * 86_400_000)) },
      { id: "demo-consent-3", patientId: "demo-patient", granteeUserId: "demo-provider-0003", resourceScope: "profile:read", purpose: "Old request (demo)", expiresAt: iso(new Date(Date.now() - 86_400_000)), revokedAt: null, createdAt: iso(new Date(Date.now() - 40 * 86_400_000)) },
    ],
    qr: new Map(),
    slots: [],
    appts: [],
  };
  const a = fixture("ambiguous");
  const c = fixture("clear");
  const rx1: Rx = { id: "demo-rx-1", status: "completed", fileName: "demo-ambiguous.jpg", createdAt: iso(new Date(Date.now() - 2 * 86_400_000)), versions: [] };
  rx1.versions.push(version(rx1.id, 1, "extraction", a.status, a.date, a.prescriber, a.meds, []));
  const rx2: Rx = { id: "demo-rx-2", status: "completed", fileName: "demo-clear.jpg", createdAt: iso(new Date(Date.now() - 5 * 86_400_000)), versions: [] };
  rx2.versions.push(version(rx2.id, 1, "extraction", c.status, c.date, c.prescriber, c.meds, []));
  s.rxs.push(rx1, rx2);

  // Slots: 3 days x 4 times for each hospital, starting tomorrow (local time).
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (const h of HOSPITALS) {
    for (let day = 1; day <= 3; day++) {
      for (const hour of [10, 11, 15, 16]) {
        const start = new Date(base);
        start.setDate(base.getDate() + day);
        start.setHours(hour, 0, 0, 0);
        const end = new Date(start.getTime() + 30 * 60_000);
        s.slots.push({ id: nextId("demo-slot"), hospitalId: h.id, startsAt: iso(start), endsAt: iso(end), booked: false });
      }
    }
  }
  return s;
}

// ---------- helpers ----------
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-Request-Id": "demo-request" } });
}
const ok = (data: unknown, status = 200): Response => respond(status, { data });
const list = (items: unknown[]): Response => respond(200, { data: items, page: { limit: 20, nextCursor: null } });
const fail = (status: number, code: string, message: string): Response => respond(status, { error: { code, message, requestId: "demo-request" } });
const invalid = (message = "Request could not be validated"): Response => fail(400, "VALIDATION_ERROR", message);
const notFound = (): Response => fail(404, "NOT_FOUND", "Not found");

function rxView(rx: Rx): Json {
  const v = rx.versions[rx.versions.length - 1];
  return {
    id: rx.id,
    patientId: "demo-patient",
    sourceType: "uploaded_physical",
    processingStatus: rx.status,
    verificationStatus: v?.verificationStatus ?? "unverified",
    prescriptionDate: v?.prescriptionDate ?? null,
    prescriberName: v?.prescriberName ?? null,
    medications: v?.medications ?? [],
    createdAt: rx.createdAt,
    updatedAt: v?.createdAt ?? rx.createdAt,
  };
}

function qrView(id: string, q: QrSess): Json {
  return { id, prescriptionId: q.prescriptionId, qrPayload: `healthhub://qr/${id}`, expiresAt: iso(new Date(q.expiresAt)), revokedAt: q.revokedAt, createdAt: q.createdAt };
}

function slotView(s: Slot): Json {
  return { id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, status: s.booked ? "booked" : "open" };
}

function apptView(a: Appt): Json {
  const slot = state.slots.find((s) => s.id === a.slotId);
  const hospital = HOSPITALS.find((h) => h.id === slot?.hospitalId);
  return {
    id: a.id,
    slotId: a.slotId,
    status: a.status,
    hospital: hospital ? { id: hospital.id, name: hospital.name, isDemo: true } : { id: "", name: "Hospital", isDemo: true },
    startsAt: slot?.startsAt ?? a.createdAt,
    endsAt: slot?.endsAt ?? a.createdAt,
    cancelledAt: a.cancelledAt,
    createdAt: a.createdAt,
  };
}

const MED_KEYS = ["name", "strength", "dose", "route", "frequency", "duration", "instructions"] as const;
const REVIEWED = ["patient_corrected", "verified_by_authorized_clinician"];
const realDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
const shiftKey = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

function scheduleView(sch: Schedule): Json {
  const rx = state.rxs.find((r) => r.id === sch.prescriptionId);
  const latest = rx?.versions[rx.versions.length - 1];
  let sourceStatus: "current" | "changed" | "removed" = "current";
  if (latest && latest.versionNumber !== sch.sourceVersionNumber) {
    const now = latest.medications[sch.position];
    if (!now) sourceStatus = "removed";
    else sourceStatus = MED_KEYS.every((k) => now[k] === sch.med[k]) ? "current" : "changed";
  }
  const today = dateKey(new Date());
  const inWindow = sch.startDate <= today && (sch.endDate === null || today <= sch.endDate);
  const cutoff = Date.now() - 14 * 86_400_000;
  return {
    id: sch.id,
    prescriptionId: sch.prescriptionId,
    sourceVersionNumber: sch.sourceVersionNumber,
    sourceStatus,
    medication: { ...sch.med },
    startDate: sch.startDate,
    endDate: sch.endDate,
    reminderTimes: sch.reminderTimes,
    remindersEnabled: sch.remindersEnabled,
    remindersActive: sch.isActive && sch.remindersEnabled && sourceStatus === "current" && inWindow,
    timezone: sch.timezone,
    isActive: sch.isActive,
    recentDoseEvents: sch.doses.filter((d) => Date.parse(d.scheduledFor) >= cutoff).slice(-20).reverse().map((d) => ({ ...d, selfReported: true })),
    notice: "This is a reminder plan made from your prescription record. It is not medical advice. Follow your doctor's instructions.",
    createdAt: sch.createdAt,
    updatedAt: sch.updatedAt,
  };
}

function changedFieldNames(prev: Version | undefined, date: string | null, prescriber: string | null, meds: Med[], confirmedRows: number[]): string[] {
  const out: string[] = [];
  if ((prev?.prescriptionDate ?? null) !== date) out.push("prescriptionDate");
  if ((prev?.prescriberName ?? null) !== prescriber) out.push("prescriberName");
  const before = prev?.medications ?? [];
  for (let i = 0; i < Math.max(before.length, meds.length); i++) {
    const b = before[i];
    const a = meds[i];
    if (!b) out.push(`medications.${i}.added`);
    else if (!a) out.push(`medications.${i}.removed`);
    else {
      for (const k of MED_KEYS) if (b[k] !== a[k]) out.push(`medications.${i}.${k}`);
      if (confirmedRows.includes(i)) out.push(`medications.${i}.confirmed`);
    }
  }
  return out;
}

/** Same safety gate as the web/mobile clients and backend note I3 (0.85, four required fields). */
function medicationIsSafe(m: Med): boolean {
  const filled = (v: string | null) => typeof v === "string" && v.trim() !== "";
  return m.confidence >= 0.85 && filled(m.name) && filled(m.strength) && filled(m.dose) && filled(m.frequency);
}

const isRecord = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const trimmedOrNull = (v: unknown): string | null | undefined => {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
};

function filePartName(body: unknown): string | null {
  const form = body as { getAll?: (k: string) => unknown[]; get?: (k: string) => unknown; _parts?: unknown[][] } | undefined;
  let part: unknown;
  try {
    if (form?.getAll) part = form.getAll("file")[0];
    else if (form?.get) part = form.get("file");
    else if (form?._parts) part = form._parts.find((p) => p[0] === "file")?.[1];
  } catch {
    part = undefined;
  }
  if (isRecord(part) && typeof part.name === "string") return part.name;
  if (part && typeof (part as { name?: unknown }).name === "string") return (part as { name: string }).name;
  return null;
}

const GENDERS = ["female", "male", "other", "prefer_not_to_say"];
const BLOODS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function patchPatient(body: unknown): Response {
  if (!isRecord(body) || Object.keys(body).length === 0) return invalid();
  const allowed = new Set(["fullName", "dateOfBirth", "gender", "bloodGroup", "phone", "emergencyContact", "allergies", "existingConditions", "currentMedications", "address"]);
  if (Object.keys(body).some((k) => !allowed.has(k))) return invalid();
  const next = { ...state.patient, emergencyContact: { ...state.patient.emergencyContact } } as State["patient"];
  for (const key of ["fullName", "phone", "address"] as const) {
    if (key in body) {
      const v = trimmedOrNull(body[key]);
      if (v === undefined) return invalid();
      if (key === "phone" && v !== null && !/^\+?[0-9\s()-]+$/.test(v)) return invalid();
      if (key === "phone" && v !== null && (v.length < 7 || v.length > 20)) return invalid();
      next[key] = v;
    }
  }
  if ("dateOfBirth" in body) {
    const v = body.dateOfBirth;
    if (v !== null && (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v < "1900-01-01" || v > dateKey(new Date()) || Number.isNaN(Date.parse(v)))) return invalid();
    next.dateOfBirth = v;
  }
  if ("gender" in body) {
    if (body.gender !== null && !GENDERS.includes(body.gender as string)) return invalid();
    next.gender = body.gender;
  }
  if ("bloodGroup" in body) {
    if (body.bloodGroup !== null && !BLOODS.includes(body.bloodGroup as string)) return invalid();
    next.bloodGroup = body.bloodGroup;
  }
  if ("emergencyContact" in body) {
    const ec = body.emergencyContact;
    if (!isRecord(ec) || Object.keys(ec).some((k) => k !== "name" && k !== "phone")) return invalid();
    for (const k of ["name", "phone"] as const) {
      if (k in ec) {
        const v = trimmedOrNull(ec[k]);
        if (v === undefined) return invalid();
        if (k === "phone" && v !== null && !/^\+?[0-9\s()-]{6,19}$/.test(v)) return invalid();
        next.emergencyContact[k] = v;
      }
    }
  }
  for (const key of ["allergies", "existingConditions", "currentMedications"] as const) {
    if (key in body) {
      const v = body[key];
      if (!Array.isArray(v) || v.length > 30 || v.some((i) => typeof i !== "string" || i.trim() === "" || i.length > 100)) return invalid();
      const seen = new Set<string>();
      next[key] = (v as string[]).map((i) => i.trim()).filter((i) => (seen.has(i.toLowerCase()) ? false : (seen.add(i.toLowerCase()), true)));
    }
  }
  next.updatedAt = iso(new Date());
  state.patient = next;
  state.access.unshift({ id: nextId("demo-a"), occurredAt: iso(new Date()), action: "patient.profile_updated", outcome: "success", actor: { type: "self" }, resourceType: "patient", details: { changedFields: Object.keys(body) } });
  return ok(state.patient);
}

function validMeds(input: unknown): Med[] | null {
  if (!Array.isArray(input) || input.length > 30) return null;
  const out: Med[] = [];
  for (const m of input) {
    if (!isRecord(m)) return null;
    if (Object.keys(m).some((k) => ![...MED_KEYS, "confirmed"].includes(k as never))) return null;
    if ("confirmed" in m && typeof m.confirmed !== "boolean") return null;
    const row: Record<string, string | null> = {};
    for (const k of MED_KEYS) {
      const v = m[k];
      if (v === undefined || v === null) row[k] = null;
      else if (typeof v === "string" && v.trim() !== "" && v.length <= 200) row[k] = v.trim();
      else return null;
    }
    if (MED_KEYS.every((k) => row[k] === null)) return null;
    out.push({ ...(row as Omit<Med, "confidence">), confidence: 0 });
  }
  return out;
}

// ---------- the fetch-compatible entry point ----------
export async function demoFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  await delay(120);
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const path = url.pathname.replace(/^\/api\/v1/, "");
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = (init?.headers ?? {}) as Record<string, string>;
  let body: unknown = init?.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return invalid();
    }
  }

  // ----- auth -----
  if (path === "/auth/register" || path === "/auth/login") {
    if (method !== "POST" || !isRecord(body)) return invalid();
    const keys = Object.keys(body);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const pw = typeof body.password === "string" ? body.password : "";
    if (keys.some((k) => k !== "email" && k !== "password") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || pw.length < 10 || pw.length > 128) return invalid();
    if (path === "/auth/register" && state.registered.has(email)) return fail(409, "CONFLICT", "Could not create the account");
    if (path === "/auth/register") state.registered.add(email);
    state.email = email;
    state.patient.fullName = demoNameFor(email);
    state.token = nextId("demo-token");
    return ok({ user: { id: "demo-user", email, role: "patient" }, accessToken: state.token, expiresAt: iso(new Date(Date.now() + 60 * 60_000)) }, path === "/auth/register" ? 201 : 200);
  }

  const auth = headers.Authorization ?? headers.authorization;
  if (!state.token || auth !== `Bearer ${state.token}`) return fail(401, "UNAUTHENTICATED", "Authentication required");

  if (path === "/auth/refresh" && method === "POST") {
    state.token = nextId("demo-token");
    return ok({ user: { id: "demo-user", email: state.email, role: "patient" }, accessToken: state.token, expiresAt: iso(new Date(Date.now() + 60 * 60_000)) });
  }

  if (path === "/auth/logout" && method === "POST") {
    state.token = null;
    return ok({ revoked: true });
  }

  // ----- patient -----
  if (path === "/patients/me") {
    if (method === "GET") return ok(state.patient);
    if (method === "PATCH") return patchPatient(body);
  }
  if (path === "/patients/me/health-card" && method === "GET") {
    const p = state.patient;
    return ok({
      healthId: p.healthId,
      fullName: p.fullName,
      dateOfBirth: p.dateOfBirth,
      bloodGroup: p.bloodGroup,
      issuer: "HealthHub (demo)",
      notice: "This is a HealthHub identifier. It is not an official or national health ID. Demo data.",
      generatedAt: iso(new Date()),
    });
  }
  if (path === "/patients/me/access-history" && method === "GET") return list(state.access);

  // ----- prescriptions -----
  if (path === "/prescriptions") {
    if (method === "GET") return list([...state.rxs].reverse().map(rxView));
    if (method === "POST") {
      const name = filePartName(body);
      if (!name) return invalid();
      const rx: Rx = { id: nextId("demo-rx"), status: "pending", fileName: name, createdAt: iso(new Date()), versions: [] };
      state.rxs.push(rx);
      return ok(rxView(rx), 201);
    }
  }
  const rxMatch = /^\/prescriptions\/([^/]+)(?:\/([a-z-]+))?$/.exec(path);
  if (rxMatch) {
    const rx = state.rxs.find((r) => r.id === decodeURIComponent(rxMatch[1] ?? ""));
    if (!rx) return notFound();
    const sub = rxMatch[2];
    if (!sub && method === "GET") return ok(rxView(rx));
    if (sub === "versions" && method === "GET") return list([...rx.versions].reverse());
    if (sub === "latest" && method === "GET") {
      const last = rx.versions[rx.versions.length - 1];
      return last ? ok(last) : fail(404, "NOT_FOUND", "No extracted version yet");
    }
    if (sub === "process" && method === "POST") {
      if (rx.status === "completed") return fail(409, "CONFLICT", "This prescription has already been read");
      if (rx.versions.some((v) => v.kind === "patient_correction")) return fail(409, "CONFLICT", "Details you entered are already saved for this prescription");
      await delay(2000);
      const lower = rx.fileName.toLowerCase();
      if (lower.includes("illegible")) {
        rx.status = "failed";
        return ok(rxView(rx));
      }
      const f = fixture(lower.includes("ambiguous") ? "ambiguous" : "clear");
      rx.versions.push(version(rx.id, rx.versions.length + 1, "extraction", f.status, f.date, f.prescriber, f.meds, []));
      rx.status = "completed";
      return ok(rxView(rx));
    }
    if (sub === "extracted-fields" && method === "PATCH") {
      // BACKEND J1: owner only, based on the version the patient saw, a NEW version is the result.
      if (rx.status === "processing") return fail(409, "CONFLICT", "The prescription is being processed");
      if (!isRecord(body) || Object.keys(body).some((k) => !["baseVersionNumber", "prescriptionDate", "prescriberName", "medications"].includes(k))) return invalid();
      const base = body.baseVersionNumber;
      if (typeof base !== "number" || !Number.isInteger(base) || base < 0) return invalid();
      if (!("prescriptionDate" in body) && !("prescriberName" in body) && !("medications" in body)) return invalid();
      if (base !== rx.versions.length) return fail(409, "CONFLICT", "The record changed since you loaded it");
      const prev = rx.versions[rx.versions.length - 1];
      let date = prev?.prescriptionDate ?? null;
      if ("prescriptionDate" in body) {
        const d = body.prescriptionDate;
        if (d !== null && (!realDate(d) || d < "1900-01-01" || d > dateKey(new Date()))) return invalid();
        date = d as string | null;
      }
      let prescriber = prev?.prescriberName ?? null;
      if ("prescriberName" in body) {
        const n = body.prescriberName;
        if (n !== null && (typeof n !== "string" || n.trim() === "")) return invalid();
        prescriber = n === null ? null : n.trim();
      }
      let meds = prev?.medications ?? [];
      const confirmedRows: number[] = [];
      if ("medications" in body) {
        const rows = validMeds(body.medications);
        if (!rows) return invalid();
        const input = body.medications as Json[];
        meds = rows.map((row, i) => {
          const before = prev?.medications[i];
          const unchanged = before !== undefined && MED_KEYS.every((k) => before[k] === row[k]);
          const confirmed = input[i]?.confirmed === true;
          if (confirmed) confirmedRows.push(i);
          // BACKEND J1/K3: unchanged keeps its confidence unless confirmed; edited or added rows are "stated by a person" (1).
          return { ...row, confidence: unchanged ? (confirmed ? 1 : (before?.confidence ?? 1)) : 1 };
        });
      }
      const changed = changedFieldNames(prev, date, prescriber, meds, confirmedRows);
      const created = version(rx.id, rx.versions.length + 1, "patient_correction", "patient_corrected", date, prescriber, meds, changed);
      rx.versions.push(created);
      if (rx.status === "failed" || rx.status === "pending") rx.status = "completed";
      return ok(created, 201);
    }
    if (sub === "pdf") return fail(404, "NOT_FOUND", "PDF is not available in demo mode");
  }

  // ----- consents (backend F3: patient sees consents they granted; revoke is idempotent) -----
  if (path === "/consents" && method === "GET") return list(state.consents);
  const consentMatch = /^\/consents\/([^/]+)$/.exec(path);
  if (consentMatch && method === "DELETE") {
    const c = state.consents.find((x) => x.id === decodeURIComponent(consentMatch[1] ?? ""));
    if (!c) return notFound();
    if (!c.revokedAt) {
      c.revokedAt = iso(new Date());
      state.access.unshift({ id: nextId("demo-a"), occurredAt: iso(new Date()), action: "consent.revoked", outcome: "success", actor: { type: "self" }, resourceType: "consent", details: { resourceScope: c.resourceScope, consentId: c.id } });
    }
    return ok(c);
  }

  // ----- medication schedules (BACKEND K) -----
  if (path === "/medication-schedules") {
    if (method === "GET") return list([...state.schedules].reverse().map(scheduleView));
    if (method === "POST") {
      const allowed = ["prescriptionId", "versionNumber", "medicationPosition", "startDate", "endDate", "reminderTimes", "remindersEnabled", "timezone"];
      if (!isRecord(body) || Object.keys(body).some((k) => !allowed.includes(k))) return invalid();
      const pos = body.medicationPosition;
      if (typeof body.prescriptionId !== "string" || typeof body.versionNumber !== "number" || typeof pos !== "number" || !Number.isInteger(pos) || pos < 0 || pos > 29) return invalid();
      if (!realDate(body.startDate) || body.startDate < shiftKey(-30) || body.startDate > shiftKey(365)) return invalid();
      if (body.endDate !== undefined && body.endDate !== null && (!realDate(body.endDate) || body.endDate < body.startDate)) return invalid();
      if (typeof body.timezone !== "string" || !/^(UTC|[A-Za-z]+(\/[A-Za-z0-9_+-]+)+)$/i.test(body.timezone)) return invalid();
      const times = body.reminderTimes === undefined ? [] : body.reminderTimes;
      if (!Array.isArray(times) || times.length > 12 || times.some((x) => typeof x !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x))) return invalid();
      const sortedTimes = [...new Set(times as string[])].sort();
      const enabled = body.remindersEnabled === true;
      if (enabled && sortedTimes.length === 0) return invalid();
      const rx = state.rxs.find((r) => r.id === body.prescriptionId);
      if (!rx) return notFound();
      const v = rx.versions[rx.versions.length - 1];
      if (!v) return fail(409, "CONFLICT", "This prescription has no details yet");
      if (v.versionNumber !== body.versionNumber) return fail(409, "CONFLICT", "The prescription changed since you loaded it. Reload and try again");
      if (!REVIEWED.includes(v.verificationStatus)) return fail(409, "CONFLICT", "Review and save this prescription yourself before making a schedule");
      const m = v.medications[pos];
      if (!m) return notFound();
      if (!medicationIsSafe(m)) return fail(409, "CONFLICT", "This medicine is incomplete or not confirmed, so a schedule can't be made");
      if (state.schedules.some((x) => x.isActive && x.prescriptionId === rx.id && x.position === pos)) return fail(409, "CONFLICT", "This medicine already has an active schedule");
      if (state.schedules.filter((x) => x.isActive).length >= 50) return fail(409, "CONFLICT", "Too many active schedules");
      const { confidence: _c, ...copy } = m;
      const sch: Schedule = {
        id: nextId("demo-sch"), prescriptionId: rx.id, position: pos, sourceVersionNumber: v.versionNumber, med: copy,
        startDate: body.startDate, endDate: (body.endDate as string | null | undefined) ?? null,
        reminderTimes: sortedTimes, remindersEnabled: enabled, timezone: body.timezone, isActive: true, doses: [],
        createdAt: iso(new Date()), updatedAt: iso(new Date()),
      };
      state.schedules.push(sch);
      return ok(scheduleView(sch), 201);
    }
  }
  const schMatch = /^\/medication-schedules\/([^/]+)(?:\/(dose-events))?$/.exec(path);
  if (schMatch) {
    const sch = state.schedules.find((s) => s.id === decodeURIComponent(schMatch[1] ?? ""));
    if (!sch) return notFound();
    if (!schMatch[2] && method === "PATCH") {
      const allowed = ["reminderTimes", "remindersEnabled", "timezone", "endDate", "isActive"];
      if (!isRecord(body) || Object.keys(body).length === 0 || Object.keys(body).some((k) => !allowed.includes(k))) return invalid();
      let times = sch.reminderTimes;
      if ("reminderTimes" in body) {
        const t = body.reminderTimes;
        if (!Array.isArray(t) || t.length > 12 || t.some((x) => typeof x !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x))) return invalid();
        times = [...new Set(t as string[])].sort();
      }
      const enabled = typeof body.remindersEnabled === "boolean" ? body.remindersEnabled : sch.remindersEnabled;
      if (enabled && times.length === 0) return invalid();
      if ("timezone" in body && (typeof body.timezone !== "string" || !/^(UTC|[A-Za-z]+(\/[A-Za-z0-9_+-]+)+)$/i.test(body.timezone))) return invalid();
      if ("endDate" in body && body.endDate !== null && (!realDate(body.endDate) || body.endDate < sch.startDate)) return invalid();
      if (typeof body.isActive === "boolean" && body.isActive && !sch.isActive) {
        if (state.schedules.some((x) => x !== sch && x.isActive && x.prescriptionId === sch.prescriptionId && x.position === sch.position)) return fail(409, "CONFLICT", "This medicine already has an active schedule");
        if ((scheduleView(sch).sourceStatus as string) !== "current") return fail(409, "CONFLICT", "The prescription has changed since this schedule was made");
      }
      sch.reminderTimes = times;
      sch.remindersEnabled = enabled;
      if (typeof body.timezone === "string") sch.timezone = body.timezone;
      if ("endDate" in body) sch.endDate = body.endDate as string | null;
      if (typeof body.isActive === "boolean") sch.isActive = body.isActive;
      sch.updatedAt = iso(new Date());
      return ok(scheduleView(sch));
    }
    if (schMatch[2] === "dose-events" && method === "POST") {
      if (!isRecord(body) || Object.keys(body).some((k) => k !== "scheduledFor" && k !== "status")) return invalid();
      if ((body.status !== "taken" && body.status !== "skipped") || typeof body.scheduledFor !== "string" || Number.isNaN(Date.parse(body.scheduledFor))) return invalid();
      const at = Date.parse(body.scheduledFor);
      if (!sch.isActive) return fail(409, "CONFLICT", "This schedule is stopped");
      if (at > Date.now() + 3_600_000) return invalid();
      const day = new Date(at).toISOString().slice(0, 10);
      if (day < sch.startDate || (sch.endDate && day > sch.endDate)) return invalid();
      if (sch.doses.some((d) => Date.parse(d.scheduledFor) === at)) return fail(409, "CONFLICT", "A dose is already recorded for this time");
      const event: DemoDose = { id: nextId("demo-dose"), scheduledFor: new Date(at).toISOString(), status: body.status, recordedAt: iso(new Date()) };
      sch.doses.push(event);
      return ok({ ...event, scheduleId: sch.id, selfReported: true }, 201);
    }
  }

  // ----- history (BACKEND L5) -----
  if (path === "/health-history" && method === "GET") return list(state.history);
  if (path === "/health-history/conditions" && method === "POST") {
    if (!isRecord(body) || Object.keys(body).some((k) => !["title", "notes", "diagnosedOn"].includes(k))) return invalid();
    const title = trimmedOrNull(body.title);
    if (!title || title.length > 120) return invalid();
    const notes = body.notes === undefined ? null : trimmedOrNull(body.notes);
    if (notes === undefined || (notes !== null && notes.length > 500)) return invalid();
    const on = body.diagnosedOn ?? null;
    if (on !== null && (!realDate(on) || on < "1900-01-01" || on > dateKey(new Date()))) return invalid();
    if (state.history.length >= 200) return fail(409, "CONFLICT", "History entry limit reached");
    const entry = { id: nextId("demo-hist"), title, kind: "condition", notes, diagnosedOn: on, createdAt: iso(new Date()), source: "patient_reported", verificationStatus: "unverified" };
    state.history.unshift(entry);
    return ok(entry, 201);
  }

  // ----- QR (BACKEND J3: random reference, 15 min, owner-only, revocable) -----
  if (path === "/qr/access-sessions" && method === "POST") {
    if (!isRecord(body) || Object.keys(body).some((k) => k !== "prescriptionId") || typeof body.prescriptionId !== "string") return invalid();
    if (!state.rxs.some((r) => r.id === body.prescriptionId)) return notFound();
    const id = nextId("demo-qr");
    const sess: QrSess = { prescriptionId: body.prescriptionId, expiresAt: Date.now() + 15 * 60_000, revokedAt: null, createdAt: iso(new Date()) };
    state.qr.set(id, sess);
    state.access.unshift({ id: nextId("demo-a"), occurredAt: iso(new Date()), action: "qr.session_created", outcome: "success", actor: { type: "self" }, resourceType: "qr_session", details: {} });
    return ok(qrView(id, sess), 201);
  }
  const qrMatch = /^\/qr\/access-sessions\/([^/]+)$/.exec(path);
  if (qrMatch) {
    const qid = decodeURIComponent(qrMatch[1] ?? "");
    const s = state.qr.get(qid);
    if (!s) return notFound();
    if (method === "GET") {
      if (s.revokedAt || s.expiresAt <= Date.now()) return notFound();
      const rx = state.rxs.find((r) => r.id === s.prescriptionId);
      return rx ? ok({ session: { id: qid, expiresAt: iso(new Date(s.expiresAt)) }, prescription: rxView(rx) }) : notFound();
    }
    if (method === "DELETE") {
      if (!s.revokedAt) {
        s.revokedAt = iso(new Date());
        state.access.unshift({ id: nextId("demo-a"), occurredAt: iso(new Date()), action: "qr.session_revoked", outcome: "success", actor: { type: "self" }, resourceType: "qr_session", details: {} });
      }
      return ok(qrView(qid, s));
    }
  }

  // ----- hospitals and appointments -----
  if (path === "/hospitals" && method === "GET") return list(HOSPITALS.map((h) => ({ ...h, isActive: true, isDemo: true })));
  const hMatch = /^\/hospitals\/([^/]+)(?:\/(availability))?$/.exec(path);
  if (hMatch && method === "GET") {
    const h = HOSPITALS.find((x) => x.id === decodeURIComponent(hMatch[1] ?? ""));
    if (!h) return notFound();
    if (hMatch[2]) return list(state.slots.filter((s) => s.hospitalId === h.id).map(slotView));
    return ok({ ...h, isActive: true, isDemo: true });
  }
  if (path === "/appointments") {
    if (method === "GET") return list([...state.appts].reverse().map(apptView));
    if (method === "POST") {
      if (!isRecord(body) || Object.keys(body).some((k) => k !== "slotId") || typeof body.slotId !== "string") return invalid();
      const slot = state.slots.find((s) => s.id === body.slotId);
      if (!slot) return notFound();
      if (Date.parse(slot.startsAt) <= Date.now()) return fail(409, "CONFLICT", "This slot has already started or passed");
      if (slot.booked) return fail(409, "CONFLICT", "This slot is no longer available");
      const mine = state.appts.filter((a) => a.status === "confirmed").map((a) => state.slots.find((x) => x.id === a.slotId)).filter((x): x is Slot => Boolean(x));
      if (mine.some((o) => Date.parse(o.startsAt) < Date.parse(slot.endsAt) && Date.parse(o.endsAt) > Date.parse(slot.startsAt))) return fail(409, "CONFLICT", "You already have an appointment at this time");
      if (mine.length >= 10) return fail(409, "CONFLICT", "Too many upcoming appointments. Cancel one first");
      slot.booked = true;
      const a: Appt = { id: nextId("demo-appt"), slotId: slot.id, status: "confirmed", cancelledAt: null, createdAt: iso(new Date()) };
      state.appts.push(a);
      return ok(apptView(a), 201);
    }
  }
  const cancelMatch = /^\/appointments\/([^/]+)\/cancel$/.exec(path);
  if (cancelMatch && method === "POST") {
    const a = state.appts.find((x) => x.id === decodeURIComponent(cancelMatch[1] ?? ""));
    if (!a) return notFound();
    if (a.status === "confirmed") {
      const st = state.slots.find((x) => x.id === a.slotId);
      if (st && Date.parse(st.startsAt) <= Date.now()) return fail(409, "CONFLICT", "This appointment has already started or passed");
      a.status = "cancelled";
      a.cancelledAt = iso(new Date());
      const slot = state.slots.find((s) => s.id === a.slotId);
      if (slot) slot.booked = false;
    }
    return ok(apptView(a));
  }

  return notFound();
}
