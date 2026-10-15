import type { Env } from "../config/env.js";
import type { Db } from "../db/client.js";
import { MockExtractionProvider } from "../extraction/mockProvider.js";
import { buildSyntheticPdf } from "../extraction/syntheticDocuments.js";
import { hashPassword } from "../lib/auth/password.js";
import { recordAudit } from "../modules/audit/audit.js";
import { DEMO_EMAIL_DOMAIN } from "../modules/auth/service.js";
import { generateHealthId } from "../modules/patients/healthId.js";
import { processPrescription } from "../modules/prescriptions/processing.js";
import { createPrescription } from "../modules/prescriptions/service.js";
import type { PrivateFileStore } from "../storage/types.js";

/**
 * Demo data for development and demos. Everything it creates is fictional and
 * labelled: accounts use the reserved @demo.healthhub.test domain, hospitals
 * are flagged isDemo and say "(demo data)", people say "(synthetic)", and the
 * prescriptions come from the synthetic fixtures. It never edits or removes
 * anything that already exists, so running it twice changes nothing.
 */
export const DEMO_PASSWORD_MIN_LENGTH = 12;

export interface SeedSummary {
  usersCreated: number;
  hospitalsCreated: number;
  slotsCreated: number;
  prescriptionsCreated: number;
  consentsCreated: number;
  historyEntriesCreated: number;
}

/** Throws unless seeding is clearly intended. Call before touching the database. */
export function assertSeedAllowed(input: { nodeEnv: string; allowDemoSeed: boolean; password: string | undefined }): string {
  if (!input.password || input.password.length < DEMO_PASSWORD_MIN_LENGTH) {
    throw new Error(`DEMO_SEED_PASSWORD is required and must be at least ${DEMO_PASSWORD_MIN_LENGTH} characters`);
  }
  if (input.nodeEnv === "production" && !input.allowDemoSeed) {
    throw new Error("Refusing to seed demo data when NODE_ENV=production. Set ALLOW_DEMO_SEED=true only for a demo deployment");
  }
  return input.password;
}

const HOSPITALS = [
  { name: "Demo General Hospital (demo data)", specialties: ["General Medicine", "Pediatrics"] },
  { name: "Demo Heart Clinic (demo data)", specialties: ["Cardiology"] },
  { name: "Demo Eye Care Centre (demo data)", specialties: ["Ophthalmology"] },
];
const SLOT_DAYS = 14;
const SLOT_MINUTES = Array.from({ length: 14 }, (_, i) => 4 * 60 + i * 30); // 04:00 to 10:30 UTC, every 30 minutes

const ACCOUNTS = [
  { local: "admin", role: "admin" as const },
  { local: "provider", role: "provider" as const },
  { local: "patient1", role: "patient" as const, name: "Demo Patient One (synthetic)", blood: "O+" },
  { local: "patient2", role: "patient" as const, name: "Demo Patient Two (synthetic)", blood: "A+" },
];

const isUnique = (err: unknown) => typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";

export async function runDemoSeed(deps: { db: Db; store: PrivateFileStore; env: Env; password: string }): Promise<SeedSummary> {
  const { db, store, env } = deps;
  const summary: SeedSummary = { usersCreated: 0, hospitalsCreated: 0, slotsCreated: 0, prescriptionsCreated: 0, consentsCreated: 0, historyEntriesCreated: 0 };
  const passwordHash = await hashPassword(deps.password);

  // Accounts. Existing ones are left exactly as they are, including their passwords.
  const users: Record<string, { id: string; patientId?: string }> = {};
  for (const account of ACCOUNTS) {
    const email = `${account.local}${DEMO_EMAIL_DOMAIN}`;
    const existing = await db.user.findUnique({ where: { email }, select: { id: true, patient: { select: { id: true } } } });
    if (existing) {
      users[account.local] = { id: existing.id, ...(existing.patient ? { patientId: existing.patient.id } : {}) };
      continue;
    }
    const user = await db.user.create({ data: { email, passwordHash, role: account.role }, select: { id: true } });
    summary.usersCreated += 1;
    users[account.local] = { id: user.id };
    if (account.role === "patient") {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const patient = await db.patient.create({
            data: {
              userId: user.id, healthId: generateHealthId(), fullName: account.name, dateOfBirth: new Date("1990-01-15T00:00:00.000Z"), gender: "prefer_not_to_say",
              bloodGroup: account.blood, phone: "+91 00000 00001", emergencyContactName: "Demo Contact (synthetic)", emergencyContactPhone: "+91 00000 00002",
              allergies: ["Synthetic allergen (demo)"], existingConditions: ["Synthetic condition (demo)"], address: "1 Demo Street, Demo City (synthetic)",
            },
            select: { id: true },
          });
          users[account.local] = { id: user.id, patientId: patient.id };
          break;
        } catch (err) {
          if (!isUnique(err)) throw err; // a health ID collision: try another
        }
      }
    }
  }

  // Hospitals and their open slots for the next two weeks.
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  for (const spec of HOSPITALS) {
    let hospital = await db.hospital.findFirst({ where: { name: spec.name, isDemo: true }, select: { id: true } });
    if (!hospital) {
      hospital = await db.hospital.create({
        data: { name: spec.name, city: "Demo City", address: "Demo Road (demo data)", phone: "+91 00000 00000", specialties: spec.specialties, isDemo: true },
        select: { id: true },
      });
      summary.hospitalsCreated += 1;
    }
    const data = [];
    for (let day = 1; day <= SLOT_DAYS; day += 1) {
      for (const minutes of SLOT_MINUTES) {
        const startsAt = new Date(start.getTime() + day * 86_400_000 + minutes * 60_000);
        data.push({ hospitalId: hospital.id, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000) });
      }
    }
    summary.slotsCreated += (await db.availabilitySlot.createMany({ data, skipDuplicates: true })).count;
  }

  // Two synthetic prescriptions, run through the real upload and extraction code.
  const provider = new MockExtractionProvider();
  for (const [local, fixture] of [["patient1", "clear-001"], ["patient2", "ambiguous-001"]] as const) {
    const patient = users[local];
    if (!patient?.patientId || (await db.prescriptionRecord.count({ where: { patientId: patient.patientId } })) > 0) continue;
    const auth = { userId: patient.id, role: "patient" as const, sessionId: "demo-seed" };
    const ctx = { requestId: "demo-seed" };
    const created = await createPrescription(
      { db, store, env },
      auth,
      { file: { buffer: buildSyntheticPdf(fixture), declaredMime: "application/pdf", filename: `${fixture}.pdf` }, fields: {} },
      ctx,
    );
    await processPrescription({ db, store, provider }, auth, { prescriptionId: created.id, patientId: patient.patientId }, ctx);
    summary.prescriptionsCreated += 1;
  }

  // The demo provider may read patient one's prescriptions and history.
  const one = users["patient1"];
  const prov = users["provider"];
  if (one?.patientId && prov) {
    for (const resourceScope of ["prescriptions:read", "health_history:read"]) {
      const existing = await db.consent.findFirst({ where: { patientId: one.patientId, granteeUserId: prov.id, resourceScope, revokedAt: null } });
      if (!existing) {
        await db.consent.create({ data: { patientId: one.patientId, granteeUserId: prov.id, resourceScope, purpose: "Demo consent (demo data)" } });
        summary.consentsCreated += 1;
      }
    }
    if ((await db.healthHistoryEntry.count({ where: { patientId: one.patientId } })) === 0) {
      await db.healthHistoryEntry.create({ data: { patientId: one.patientId, title: "Synthetic demo condition (demo data)", notes: "Fictional entry for demos." } });
      summary.historyEntriesCreated += 1;
    }
  }

  await recordAudit(db, { action: "seed.demo_loaded", outcome: "success", metadata: { ...summary } });
  return summary;
}
