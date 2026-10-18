import { ApiError } from "@/lib/api/errors";
import type { PrescriptionsApi } from "@/lib/api/prescriptions";
import type {
  AuthUser,
  CorrectionInput,
  Prescription,
  PrescriptionMedication,
  PrescriptionVersion,
  UploadInput,
} from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { PROCESSING_STATUS, VERIFICATION_STATUS } from "@/lib/status";
import { medicationReviewReasons, REVIEW_REASON_LABEL } from "@/lib/prescription-safety";

import { buildPdf, type PdfLine } from "./pdf";
import { currentUser, demoPatientsApi, isSeeded, requirePatient } from "./records";

/**
 * DEMO ONLY. Typed stand-in for the /prescriptions endpoints.
 *
 * - The uploaded file is never sent anywhere and is not read. Reading is SIMULATED: after a short delay the record
 *   is filled from a fixed synthetic extraction fixture, so the processing, review and correction flows can be tried.
 *   (A file whose name contains "unreadable" simulates the failed state.)
 * - Seeded sample prescriptions (demo-patient only) are generated relative to now; anything the user creates or
 *   corrects is kept in this browser's localStorage.
 */
const DAY = 86_400_000;
const SIMULATED_READING_MS = 3000;
const SEEDED_PATIENT_RECORD_ID = "demo-patient-record";

interface DemoState {
  /** Prescriptions created by upload in this browser. */
  created: Prescription[];
  /** Edits to seeded prescriptions (corrections). */
  overrides: Record<string, Prescription>;
  /** Versions added after the first extraction. */
  extraVersions: Record<string, PrescriptionVersion[]>;
  /** Simulated reading jobs for created prescriptions. */
  jobs: Record<string, { completesAt: number; fail: boolean }>;
}

const key = (userId: string) => `healthhub-demo-rx:v1:${userId}`;

function load(userId: string): DemoState {
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (raw) return JSON.parse(raw) as DemoState;
  } catch {
    /* fall through to empty state */
  }
  return { created: [], overrides: {}, extraVersions: {}, jobs: {} };
}

function save(userId: string, state: DemoState) {
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(state));
  } catch {
    throw new ApiError({ code: "DEMO_UNSUPPORTED", message: "Demo mode needs browser storage, which is blocked in this browser.", status: 0 });
  }
}

function notFound(): never {
  throw new ApiError({ code: "NOT_FOUND", message: "This prescription doesn’t exist or isn’t available to you.", status: 404 });
}

/** Synthetic extraction fixture: one clearly read medicine and one the "reader" is unsure about. */
function fixtureMedications(): PrescriptionMedication[] {
  return [
    { name: "Cefixime", strength: "200 mg", dose: "1 tablet", route: "oral", frequency: "Twice a day", duration: "5 days", instructions: "After food", confidence: 0.94, source: "extracted" },
    { name: "Pantoprazole", strength: "40 mg", dose: "1 tablet", route: "oral", frequency: null, duration: null, instructions: null, confidence: 0.66, source: "extracted" },
  ];
}

function seededPrescriptions(): { items: Prescription[]; versions: Record<string, PrescriptionVersion[]> } {
  const now = Date.now();
  const iso = (offsetDays: number) => new Date(now - offsetDays * DAY).toISOString();
  const day = (offsetDays: number) => iso(offsetDays).slice(0, 10);
  const base = { patientId: SEEDED_PATIENT_RECORD_ID, sourceType: "uploaded_physical" as const, processingStatus: "completed" as const, isDemo: true };

  const rx2Meds: PrescriptionMedication[] = [
    { name: "Azithromycin", strength: "500 mg", dose: "1 tablet", route: "oral", frequency: "Once a day", duration: "3 days", instructions: null, confidence: 0.91, source: "extracted" },
    { name: "Vitamin D3", strength: "60000 IU", dose: null, route: null, frequency: null, duration: null, instructions: null, confidence: 0.58, source: "extracted" },
  ];
  const rx1Original: PrescriptionMedication[] = [
    { name: "Paracetamol", strength: "500 mg", dose: null, route: "oral", frequency: "Once a day", duration: "5 days", instructions: null, confidence: 0.71, source: "extracted" },
  ];
  const rx1Corrected: PrescriptionMedication[] = [
    { name: "Paracetamol", strength: "500 mg", dose: "1 tablet", route: "oral", frequency: "Twice a day", duration: "5 days", instructions: null, confidence: 1, source: "patient_entered" },
  ];

  const items: Prescription[] = [
    {
      ...base,
      id: "demo-rx-2",
      verificationStatus: "needs_review",
      prescriptionDate: day(2),
      prescriberName: "Dr. Sample Prescriber",
      medications: rx2Meds,
      createdAt: iso(2),
      updatedAt: iso(2),
      sourceFile: { fileName: "sample-prescription-2.jpg", mimeType: "image/jpeg", sizeBytes: 1_482_000 },
    },
    {
      ...base,
      id: "demo-rx-1",
      verificationStatus: "patient_corrected",
      prescriptionDate: day(21),
      prescriberName: "Dr. Sample Prescriber",
      medications: rx1Corrected,
      createdAt: iso(21),
      updatedAt: iso(20),
      sourceFile: { fileName: "sample-prescription-1.pdf", mimeType: "application/pdf", sizeBytes: 312_000 },
    },
  ];

  const versions: Record<string, PrescriptionVersion[]> = {
    "demo-rx-2": [
      { id: "demo-rx-2-v1", versionNumber: 1, kind: "extraction", createdAt: iso(2), verificationStatus: "needs_review", prescriptionDate: day(2), prescriberName: "Dr. Sample Prescriber", medications: rx2Meds },
    ],
    "demo-rx-1": [
      { id: "demo-rx-1-v1", versionNumber: 1, kind: "extraction", createdAt: iso(21), verificationStatus: "needs_review", prescriptionDate: day(21), prescriberName: "Dr. Sample Prescriber", medications: rx1Original },
      { id: "demo-rx-1-v2", versionNumber: 2, kind: "patient_correction", createdAt: iso(20), verificationStatus: "patient_corrected", prescriptionDate: day(21), prescriberName: "Dr. Sample Prescriber", medications: rx1Corrected },
    ],
  };
  return { items, versions };
}

/** Finish any simulated reading jobs whose time has come, and persist the result. */
function settle(userId: string, state: DemoState): DemoState {
  const now = Date.now();
  let changed = false;
  for (const [id, job] of Object.entries(state.jobs)) {
    if (now < job.completesAt) continue;
    const rx = state.created.find((p) => p.id === id);
    delete state.jobs[id];
    changed = true;
    if (!rx) continue;
    const stamp = new Date().toISOString();
    if (job.fail) {
      rx.processingStatus = "failed";
      rx.updatedAt = stamp;
      continue;
    }
    rx.processingStatus = "completed";
    rx.verificationStatus = "needs_review";
    rx.medications = fixtureMedications();
    rx.updatedAt = stamp;
    const versions = (state.extraVersions[id] ??= []);
    versions.push({
      id: `${id}-v${versions.length + 1}`,
      versionNumber: versions.length + 1,
      kind: "extraction",
      createdAt: stamp,
      verificationStatus: "needs_review",
      prescriptionDate: rx.prescriptionDate,
      prescriberName: rx.prescriberName,
      medications: rx.medications,
    });
  }
  if (changed) save(userId, state);
  return state;
}

interface Context {
  user: AuthUser;
  state: DemoState;
  all: Prescription[];
  seededVersions: Record<string, PrescriptionVersion[]>;
}

async function context(): Promise<Context> {
  const user = await currentUser();
  requirePatient(user);
  const state = settle(user.id, load(user.id));
  const seeded = isSeeded(user) ? seededPrescriptions() : { items: [], versions: {} };
  const seededWithEdits = seeded.items.map((p) => state.overrides[p.id] ?? p);
  const all = [...state.created, ...seededWithEdits].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { user, state, all, seededVersions: seeded.versions };
}

function pdfLines(rx: Prescription, healthId: string): PdfLine[] {
  const lines: PdfLine[] = [
    { text: "DEMO DOCUMENT - synthetic data, not a real prescription", bold: true, size: 10 },
    { text: "HealthHub prescription record", bold: true, size: 20, gap: 14 },
    { text: `HealthHub ID: ${healthId}`, gap: 12 },
    { text: `Prescription record ID: ${rx.id}` },
    { text: "Source: Scanned from a paper prescription (not a digitally issued or signed prescription)" },
    { text: `Reading status: ${PROCESSING_STATUS[rx.processingStatus].label}` },
    { text: `Verification: ${VERIFICATION_STATUS[rx.verificationStatus].label}. ${VERIFICATION_STATUS[rx.verificationStatus].explanation}` },
    { text: `Prescription date: ${formatDate(rx.prescriptionDate)}` },
    { text: `Prescriber: ${rx.prescriberName ?? "Not provided"}` },
    { text: "Medicines", bold: true, size: 14, gap: 16 },
  ];
  if (rx.medications.length === 0) lines.push({ text: "No medicines have been read from this prescription." });
  rx.medications.forEach((m, i) => {
    const reasons = medicationReviewReasons(m);
    lines.push({ text: `${i + 1}. ${m.name ?? "Name not found"} ${m.strength ?? ""}`.trim(), bold: true, gap: 8 });
    lines.push({
      text: `Dose: ${m.dose ?? "not found"} | How often: ${m.frequency ?? "not found"} | Duration: ${m.duration ?? "not found"} | Route: ${m.route ?? "not found"}`,
    });
    if (m.instructions) lines.push({ text: `Instructions: ${m.instructions}` });
    lines.push({
      text:
        m.source === "patient_entered"
          ? "Entered by the patient. Not verified by a clinician."
          : reasons.length
            ? `NEEDS REVIEW: ${reasons.map((r) => REVIEW_REASON_LABEL[r]).join("; ")}. Do not rely on this line.`
            : "Read clearly from the scan. Not verified by a clinician.",
    });
  });
  lines.push({ text: `QR reference: demo-qr-${rx.id}`, gap: 18 });
  lines.push({ text: "A QR image is not included in this demo PDF. The reference contains no medical information.", size: 9 });
  lines.push({ text: "Check every detail against the paper prescription. Ask your doctor or pharmacist how to take any medicine.", size: 9, gap: 6 });
  return lines;
}

export const demoPrescriptionsApi: PrescriptionsApi = {
  async list() {
    return (await context()).all;
  },

  async get(id) {
    const rx = (await context()).all.find((p) => p.id === id);
    return rx ?? notFound();
  },

  async upload(input: UploadInput) {
    const ctx = await context();
    const id = `demo-rx-${crypto.randomUUID().slice(0, 8)}`;
    const stamp = new Date().toISOString();
    const rx: Prescription = {
      id,
      patientId: SEEDED_PATIENT_RECORD_ID,
      sourceType: "uploaded_physical",
      processingStatus: "processing",
      verificationStatus: "unverified",
      prescriptionDate: input.prescriptionDate ?? null,
      prescriberName: input.prescriberName ?? null,
      medications: [],
      createdAt: stamp,
      updatedAt: stamp,
      isDemo: true,
      sourceFile: { fileName: input.file.name, mimeType: input.file.type || "application/octet-stream", sizeBytes: input.file.size },
    };
    ctx.state.created.unshift(rx);
    ctx.state.jobs[id] = { completesAt: Date.now() + SIMULATED_READING_MS, fail: /unreadable/i.test(input.file.name) };
    save(ctx.user.id, ctx.state);
    return { id, processingStatus: rx.processingStatus };
  },

  async process(id) {
    const ctx = await context();
    const rx = ctx.state.created.find((p) => p.id === id);
    if (!rx) {
      if (ctx.all.some((p) => p.id === id)) {
        throw new ApiError({ code: "CONFLICT", message: "This prescription has already been read.", status: 409 });
      }
      notFound();
    }
    rx.processingStatus = "processing";
    rx.updatedAt = new Date().toISOString();
    ctx.state.jobs[id] = { completesAt: Date.now() + SIMULATED_READING_MS, fail: false };
    save(ctx.user.id, ctx.state);
    return { id, processingStatus: rx.processingStatus };
  },

  async versions(id) {
    const ctx = await context();
    if (!ctx.all.some((p) => p.id === id)) notFound();
    const base = ctx.seededVersions[id] ?? [];
    const extra = ctx.state.extraVersions[id] ?? [];
    const merged = [...base, ...extra].map((v, i) => ({ ...v, versionNumber: i + 1 }));
    return merged;
  },

  async correct(id, input: CorrectionInput) {
    const ctx = await context();
    const rx = ctx.all.find((p) => p.id === id) ?? notFound();
    if (rx.processingStatus !== "completed") {
      throw new ApiError({ code: "CONFLICT", message: "Details can be corrected after the file has been read.", status: 409 });
    }
    const same = (a: PrescriptionMedication, b: CorrectionInput["medications"][number]) =>
      (["name", "strength", "dose", "route", "frequency", "duration", "instructions"] as const).every((f) => (a[f] ?? null) === (b[f] ?? null));

    const medications: PrescriptionMedication[] = input.medications.map((m) => {
      const prev = rx.medications.find((p) => same(p, m));
      return prev ?? { ...m, confidence: 1, source: "patient_entered" };
    });
    const stamp = new Date().toISOString();
    const updated: Prescription = {
      ...rx,
      medications,
      prescriptionDate: input.prescriptionDate,
      prescriberName: input.prescriberName,
      verificationStatus: "patient_corrected",
      updatedAt: stamp,
    };

    const existing = ctx.state.created.findIndex((p) => p.id === id);
    if (existing >= 0) ctx.state.created[existing] = updated;
    else ctx.state.overrides[id] = updated;

    const versions = (ctx.state.extraVersions[id] ??= []);
    const baseCount = (ctx.seededVersions[id] ?? []).length;
    versions.push({
      id: `${id}-v${baseCount + versions.length + 1}`,
      versionNumber: baseCount + versions.length + 1,
      kind: "patient_correction",
      createdAt: stamp,
      verificationStatus: "patient_corrected",
      prescriptionDate: updated.prescriptionDate,
      prescriberName: updated.prescriberName,
      medications,
    });
    save(ctx.user.id, ctx.state);
    return updated;
  },

  async downloadPdf(id) {
    const rx = (await context()).all.find((p) => p.id === id) ?? notFound();
    const patient = await demoPatientsApi.getMe();
    return { blob: buildPdf(pdfLines(rx, patient.healthId)), filename: `healthhub-prescription-${id}.pdf` };
  },

  async downloadFile(id) {
    const rx = (await context()).all.find((p) => p.id === id) ?? notFound();
    const patient = await demoPatientsApi.getMe();
    return { blob: buildPdf(pdfLines(rx, patient.healthId)), filename: `prescription-${id}.pdf` };
  },

  async contraindications(id) {
    return {
      prescriptionId: id,
      hasInteractions: false,
      alerts: [],
      summary: "No significant contraindications detected in demo mode.",
      disclaimer: "Safety notice: Demo simulated contraindication check.",
      analyzedAt: new Date().toISOString(),
    };
  },
};
