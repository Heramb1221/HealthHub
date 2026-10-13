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
interface Schedule {
  id: string;
  medicationName: string;
  dose: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
  reminderTimes: string[];
  remindersEnabled: boolean;
  timezone: string;
  isActive: boolean;
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
  qr: Map<string, { prescriptionId: string; expiresAt: number }>;
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
      { id: "demo-hist-1", title: "Seasonal allergy (demo entry)", kind: "condition", notes: "Sample entry reported by the patient.", recordedAt: iso(new Date(Date.now() - 30 * 86_400_000)), source: "patient_reported", verificationStatus: "unverified" },
    ],
    access: [
      { id: "demo-a1", occurredAt: iso(new Date(Date.now() - 86_400_000)), action: "patient.profile_updated", outcome: "success", actor: { type: "self" }, resourceType: "patient", details: { changedFields: ["phone"] } },
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
    createdAt: a.createdAt,
    slot: slot ? { startsAt: slot.startsAt, endsAt: slot.endsAt, hospitalId: slot.hospitalId } : undefined,
    hospital: hospital ? { id: hospital.id, name: hospital.name, isDemo: true } : undefined,
  };
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
    const allowed = ["name", "strength", "dose", "route", "frequency", "duration", "instructions"];
    if (Object.keys(m).some((k) => !allowed.includes(k))) return null;
    const field = (k: string): string | null => {
      const v = m[k];
      return typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null;
    };
    out.push({ name: field("name"), strength: field("strength"), dose: field("dose"), route: field("route"), frequency: field("frequency"), duration: field("duration"), instructions: field("instructions"), confidence: 0 });
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
    state.token = nextId("demo-token");
    return ok({ user: { id: "demo-user", email, role: "patient" }, accessToken: state.token, expiresAt: iso(new Date(Date.now() + 60 * 60_000)) }, path === "/auth/register" ? 201 : 200);
  }

  const auth = headers.Authorization ?? headers.authorization;
  if (!state.token || auth !== `Bearer ${state.token}`) return fail(401, "UNAUTHENTICATED", "Authentication required");

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
    if (sub === "process" && method === "POST") {
      if (rx.status === "completed") return fail(409, "CONFLICT", "This prescription has already been read");
      await delay(500);
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
      if (rx.status !== "completed" && rx.status !== "failed") return fail(409, "CONFLICT", "Wait for reading to finish first");
      if (!isRecord(body) || Object.keys(body).some((k) => !["prescriptionDate", "prescriberName", "medications"].includes(k))) return invalid();
      const meds = validMeds(body.medications);
      const date = body.prescriptionDate;
      if (!meds || (date !== null && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))))) return invalid();
      const prev = rx.versions[rx.versions.length - 1];
      // A patient correction carries forward the extraction confidence per medicine position; new rows get 0 (never "confident").
      const carried = meds.map((m, i) => ({ ...m, confidence: prev?.medications[i]?.confidence ?? 0 }));
      rx.versions.push(version(rx.id, rx.versions.length + 1, "patient_correction", "patient_corrected", (date as string | null) ?? null, trimmedOrNull(body.prescriberName) ?? null, carried, ["medications"]));
      rx.status = "completed";
      return ok(rxView(rx));
    }
    if (sub === "pdf") return fail(404, "NOT_FOUND", "PDF is not available in demo mode");
  }

  // ----- medication schedules -----
  if (path === "/medication-schedules") {
    if (method === "GET") return list(state.schedules);
    if (method === "POST") {
      if (!isRecord(body)) return invalid();
      const rx = state.rxs.find((r) => r.id === body.prescriptionId);
      const idx = body.medicationIndex;
      if (!rx || typeof idx !== "number" || typeof body.startDate !== "string" || typeof body.timezone !== "string") return invalid();
      const v = rx.versions[rx.versions.length - 1];
      const m = v?.medications[idx];
      if (!v || !m) return notFound();
      if (rx.status !== "completed" || v.verificationStatus === "needs_review" || !medicationIsSafe(m)) {
        return fail(409, "CONFLICT", "This medicine needs review before a schedule can be made");
      }
      const f = (m.frequency ?? "").toLowerCase();
      const times = f.includes("twice") ? ["08:00", "20:00"] : f.includes("once") ? ["08:00"] : [];
      const sch: Schedule = {
        id: nextId("demo-sch"),
        medicationName: m.name ?? "Medicine",
        dose: [m.strength, m.dose].filter(Boolean).join(" · "),
        frequency: m.frequency ?? "",
        startDate: body.startDate,
        endDate: null,
        reminderTimes: times,
        remindersEnabled: times.length > 0,
        timezone: body.timezone,
        isActive: true,
      };
      state.schedules.push(sch);
      return ok(sch, 201);
    }
  }
  const schMatch = /^\/medication-schedules\/([^/]+)(?:\/(dose-events))?$/.exec(path);
  if (schMatch) {
    const sch = state.schedules.find((s) => s.id === decodeURIComponent(schMatch[1] ?? ""));
    if (!sch) return notFound();
    if (!schMatch[2] && method === "PATCH") {
      if (!isRecord(body) || Object.keys(body).some((k) => !["remindersEnabled", "reminderTimes", "isActive"].includes(k))) return invalid();
      if ("reminderTimes" in body) {
        const t = body.reminderTimes;
        if (!Array.isArray(t) || t.some((x) => typeof x !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x))) return invalid();
        sch.reminderTimes = t as string[];
      }
      if (typeof body.remindersEnabled === "boolean") sch.remindersEnabled = body.remindersEnabled;
      if (typeof body.isActive === "boolean") sch.isActive = body.isActive;
      return ok(sch);
    }
    if (schMatch[2] === "dose-events" && method === "POST") {
      if (!isRecord(body) || (body.status !== "taken" && body.status !== "skipped") || typeof body.scheduledFor !== "string" || Number.isNaN(Date.parse(body.scheduledFor))) return invalid();
      return ok({ id: nextId("demo-dose"), scheduledFor: body.scheduledFor, status: body.status, reportedAt: iso(new Date()), selfReported: true }, 201);
    }
  }

  // ----- history -----
  if (path === "/health-history" && method === "GET") return list(state.history);
  if (path === "/health-history/conditions" && method === "POST") {
    if (!isRecord(body) || Object.keys(body).some((k) => k !== "name" && k !== "notes")) return invalid();
    const name = trimmedOrNull(body.name);
    if (!name) return invalid();
    const entry = { id: nextId("demo-hist"), title: name, kind: "condition", notes: trimmedOrNull(body.notes) ?? null, recordedAt: iso(new Date()), source: "patient_reported", verificationStatus: "unverified" };
    state.history.unshift(entry);
    return ok(entry, 201);
  }

  // ----- QR -----
  if (path === "/qr/access-sessions" && method === "POST") {
    if (!isRecord(body) || typeof body.prescriptionId !== "string" || !state.rxs.some((r) => r.id === body.prescriptionId)) return invalid();
    const id = nextId("demo-qr");
    const expiresAt = Date.now() + 10 * 60_000;
    state.qr.set(id, { prescriptionId: body.prescriptionId, expiresAt });
    state.access.unshift({ id: nextId("demo-a"), occurredAt: iso(new Date()), action: "consent.created", outcome: "success", actor: { type: "self" }, resourceType: "qr_session", details: { resourceScope: "prescriptions:read" } });
    return ok({ id, expiresAt: iso(new Date(expiresAt)), reference: `healthhub://demo-qr/${id}` }, 201);
  }
  const qrMatch = /^\/qr\/access-sessions\/([^/]+)$/.exec(path);
  if (qrMatch && method === "GET") {
    const s = state.qr.get(decodeURIComponent(qrMatch[1] ?? ""));
    if (!s || s.expiresAt <= Date.now()) return notFound();
    const rx = state.rxs.find((r) => r.id === s.prescriptionId);
    return ok({ status: "active", expiresAt: iso(new Date(s.expiresAt)), prescription: rx ? { medications: rxView(rx).medications } : undefined });
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
      if (slot.booked) return fail(409, "CONFLICT", "Slot already booked");
      slot.booked = true;
      const a: Appt = { id: nextId("demo-appt"), slotId: slot.id, status: "confirmed", createdAt: iso(new Date()) };
      state.appts.push(a);
      return ok(apptView(a), 201);
    }
  }
  const cancelMatch = /^\/appointments\/([^/]+)\/cancel$/.exec(path);
  if (cancelMatch && method === "POST") {
    const a = state.appts.find((x) => x.id === decodeURIComponent(cancelMatch[1] ?? ""));
    if (!a) return notFound();
    if (a.status === "confirmed") {
      a.status = "cancelled";
      const slot = state.slots.find((s) => s.id === a.slotId);
      if (slot) slot.booked = false;
    }
    return ok(apptView(a));
  }

  return notFound();
}
