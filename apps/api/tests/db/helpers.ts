import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { createDb, type Db } from "../../src/db/client.js";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** Refuses to touch any database whose name does not end in `_test`. */
export function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL must point at a database whose name ends in _test");
  }
}

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "..", "prisma", "migrations");

/** Drops everything and applies every migration.sql in order, as `prisma migrate deploy` would. */
export async function resetAndMigrate(client: pg.Client): Promise<void> {
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const dir of dirs) {
    await client.query(readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"));
  }
}

export interface Harness {
  pg: pg.Client;
  db: Db;
}

export async function openHarness(url: string): Promise<Harness> {
  assertTestDatabase(url);
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await resetAndMigrate(client);
  return { pg: client, db: createDb(url) };
}

export async function closeHarness(h: Harness): Promise<void> {
  await h.db.$disconnect();
  await h.pg.end();
}

let counter = 0;
export function uniq(prefix: string): string {
  counter += 1;
  return `${prefix}-${process.pid}-${counter}`;
}

export async function makePatient(db: Db, role: "patient" | "admin" | "provider" = "patient") {
  const user = await db.user.create({
    data: { email: `${uniq("u")}@example.test`, passwordHash: "not-a-real-hash", role },
  });
  const patient = await db.patient.create({ data: { userId: user.id, healthId: uniq("HID") } });
  return { user, patient };
}

export async function makeSlot(db: Db) {
  const hospital = await db.hospital.create({ data: { name: "Demo Hospital", isDemo: true } });
  const startsAt = new Date(Date.now() + 86_400_000);
  const slot = await db.availabilitySlot.create({
    data: { hospitalId: hospital.id, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000) },
  });
  return { hospital, slot };
}

export async function makePrescription(db: Db, patientId: string) {
  return db.prescriptionRecord.create({
    data: {
      patientId,
      originalStorageKey: uniq("key"),
      originalFileName: "synthetic.png",
      originalMimeType: "image/png",
      originalSizeBytes: 1234,
      originalSha256: "0".repeat(64),
    },
  });
}

/** Postgres SQLSTATE of a rejected raw query, or undefined if it did not fail. */
export async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}
