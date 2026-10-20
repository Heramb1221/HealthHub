import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockExtractionProvider } from "../../src/extraction/mockProvider.js";
import { DEMO_PASSWORD_MIN_LENGTH, assertSeedAllowed, runDemoSeed } from "../../src/seed/demoSeed.js";
import { LocalFileStore } from "../../src/storage/localFileStore.js";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, testEnv } from "./appHelpers.js";

const PASSWORD = "Demo-seed-pass-12";

describe("assertSeedAllowed", () => {
  it("needs a strong enough password", () => {
    for (const bad of [undefined, "", "short", "x".repeat(DEMO_PASSWORD_MIN_LENGTH - 1)]) {
      expect(() => assertSeedAllowed({ nodeEnv: "development", allowDemoSeed: false, password: bad })).toThrow(/DEMO_SEED_PASSWORD/);
    }
    expect(assertSeedAllowed({ nodeEnv: "development", allowDemoSeed: false, password: PASSWORD })).toBe(PASSWORD);
  });

  it("refuses production unless explicitly allowed", () => {
    expect(() => assertSeedAllowed({ nodeEnv: "production", allowDemoSeed: false, password: PASSWORD })).toThrow(/production/);
    expect(assertSeedAllowed({ nodeEnv: "production", allowDemoSeed: true, password: PASSWORD })).toBe(PASSWORD);
    for (const env of ["development", "test"]) expect(assertSeedAllowed({ nodeEnv: env, allowDemoSeed: false, password: PASSWORD })).toBe(PASSWORD);
  });

  it("never echoes the password in its errors", () => {
    try {
      assertSeedAllowed({ nodeEnv: "production", allowDemoSeed: false, password: PASSWORD });
    } catch (err) {
      expect(String(err)).not.toContain(PASSWORD);
    }
  });
});

describe.skipIf(!TEST_DATABASE_URL)("demo seed", () => {
  let h: Harness;
  let root: string;
  let store: LocalFileStore;
  let app: ReturnType<typeof buildApp>;
  const url = TEST_DATABASE_URL as string;
  const env = () => testEnv(url);

  const counts = async () => ({
    users: await h.db.user.count(),
    patients: await h.db.patient.count(),
    hospitals: await h.db.hospital.count(),
    slots: await h.db.availabilitySlot.count(),
    prescriptions: await h.db.prescriptionRecord.count(),
    versions: await h.db.prescriptionVersion.count(),
    consents: await h.db.consent.count(),
    history: await h.db.healthHistoryEntry.count(),
  });

  beforeAll(async () => {
    h = await openHarness(url);
    root = await mkdtemp(join(tmpdir(), "hh-seed-test-"));
    store = new LocalFileStore(root);
    app = buildApp(h.db, env(), undefined, store, new MockExtractionProvider());
  });
  afterAll(async () => {
    await closeHarness(h);
    await rm(root, { recursive: true, force: true });
  });

  let first: Awaited<ReturnType<typeof runDemoSeed>>;
  let before: Awaited<ReturnType<typeof counts>>;
  let real: { userId: string; hospitalId: string };

  it("leaves real data alone and creates the expected demo data", async () => {

    const user = await h.db.user.create({ data: { email: "real.person@example.test", passwordHash: "keep-me", role: "patient" } });
    const hospital = await h.db.hospital.create({ data: { name: "Real Hospital", isDemo: false } });
    real = { userId: user.id, hospitalId: hospital.id };
    before = await counts();

    first = await runDemoSeed({ db: h.db, store, env: env(), password: PASSWORD });
    expect(first).toEqual({ usersCreated: 4, hospitalsCreated: 3, slotsCreated: 3 * 14 * 14, prescriptionsCreated: 2, consentsCreated: 2, historyEntriesCreated: 1 });

    const after = await counts();
    expect(after.users - before.users).toBe(4);
    expect(after.hospitals - before.hospitals).toBe(3);
    expect(await h.db.user.findUniqueOrThrow({ where: { id: real.userId } })).toMatchObject({ email: "real.person@example.test", passwordHash: "keep-me" });
    expect(await h.db.hospital.findUniqueOrThrow({ where: { id: real.hospitalId } })).toMatchObject({ name: "Real Hospital", isDemo: false });
  });

  it("labels everything it creates as demo or synthetic", async () => {
    const demoUsers = await h.db.user.findMany({ where: { email: { endsWith: "@demo.healthhub.test" } }, include: { patient: true } });
    expect(demoUsers.map((u) => u.email).sort()).toEqual(["admin@demo.healthhub.test", "patient1@demo.healthhub.test", "patient2@demo.healthhub.test", "provider@demo.healthhub.test"]);
    expect(demoUsers.map((u) => u.role).sort()).toEqual(["admin", "patient", "patient", "provider"]);
    for (const u of demoUsers.filter((x) => x.patient)) {
      expect(u.patient?.fullName).toMatch(/\(synthetic\)/);
      expect(u.patient?.healthId).toMatch(/^HH-/);
      expect(u.patient?.phone).toMatch(/^\+91 00000 0000\d$/);
    }
    const seeded = await h.db.hospital.findMany({ where: { id: { not: real.hospitalId } } });
    expect(seeded).toHaveLength(3);
    for (const hosp of seeded) {
      expect(hosp.isDemo).toBe(true);
      expect(hosp.name).toMatch(/\(demo data\)/);
    }
    const versions = await h.db.prescriptionVersion.findMany();
    expect(versions.map((v) => v.extractionProvider)).toEqual(["mock-synthetic", "mock-synthetic"]);
    const entry = await h.db.healthHistoryEntry.findFirstOrThrow();
    expect(entry.title).toMatch(/demo data/);
    expect(entry.verificationStatus).toBe("unverified");
  });

  it("is idempotent: a second run creates nothing and changes nothing", async () => {
    const mid = await counts();
    const again = await runDemoSeed({ db: h.db, store, env: env(), password: "A-different-password-9" });
    expect(again).toEqual({ usersCreated: 0, hospitalsCreated: 0, slotsCreated: 0, prescriptionsCreated: 0, consentsCreated: 0, historyEntriesCreated: 0 });
    expect(await counts()).toEqual(mid);

    const login = await request(app).post("/api/v1/auth/login").send({ email: "patient1@demo.healthhub.test", password: PASSWORD });
    expect(login.status).toBe(200);
    const wrong = await request(app).post("/api/v1/auth/login").send({ email: "patient1@demo.healthhub.test", password: "A-different-password-9" });
    expect(wrong.status).toBe(401);
  });

  it("creates accounts that really log in, with hashed passwords", async () => {
    for (const [email, role] of [["admin", "admin"], ["provider", "provider"], ["patient1", "patient"], ["patient2", "patient"]] as const) {
      const res = await request(app).post("/api/v1/auth/login").send({ email: `${email}@demo.healthhub.test`, password: PASSWORD });
      expect(res.status, email).toBe(200);
      expect(res.body.data.user.role).toBe(role);
    }
    const user = await h.db.user.findUniqueOrThrow({ where: { email: "admin@demo.healthhub.test" } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
  });

  const token = async (local: string) =>
    (await request(app).post("/api/v1/auth/login").send({ email: `${local}@demo.healthhub.test`, password: PASSWORD })).body.data.accessToken as string;

  it("gives the demo patients prescriptions in the states the demo needs, and the provider the right access", async () => {
    const p1 = await token("patient1");
    const p2 = await token("patient2");
    const prov = await token("provider");
    const admin = await token("admin");
    const rx1 = (await request(app).get("/api/v1/prescriptions").set(bearer(p1))).body.data;
    const rx2 = (await request(app).get("/api/v1/prescriptions").set(bearer(p2))).body.data;
    expect(rx1).toHaveLength(1);
    expect(rx1[0]).toMatchObject({ processingStatus: "completed", verificationStatus: "unverified" });
    expect(rx1[0].medications).toHaveLength(2);
    expect(rx2[0]).toMatchObject({ processingStatus: "completed", verificationStatus: "needs_review" });

    expect((await request(app).get(`/api/v1/prescriptions/${rx1[0].id}`).set(bearer(prov))).status).toBe(200);
    expect((await request(app).get(`/api/v1/prescriptions/${rx2[0].id}`).set(bearer(prov))).status).toBe(403);
    expect((await request(app).get(`/api/v1/prescriptions/${rx1[0].id}`).set(bearer(admin))).status).toBe(403);
    const p1Id = (await request(app).get("/api/v1/patients/me").set(bearer(p1))).body.data.id;
    const history = await request(app).get(`/api/v1/health-history?patientId=${p1Id}`).set(bearer(prov));
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);

    const refused = await request(app).post("/api/v1/medication-schedules").set(bearer(p1)).send({
      prescriptionId: rx1[0].id, versionNumber: 1, medicationPosition: 0, startDate: new Date().toISOString().slice(0, 10), timezone: "UTC",
    });
    expect(refused.status).toBe(409);
  });

  it("offers slots that can be booked, once each", async () => {
    const p1 = await token("patient1");
    const p2 = await token("patient2");
    const hospitals = (await request(app).get("/api/v1/hospitals?limit=100").set(bearer(p1))).body.data as Array<{ id: string; isDemo: boolean; name: string }>;
    const demo = hospitals.filter((x) => x.isDemo);
    expect(demo).toHaveLength(3);
    expect(hospitals.find((x) => x.name === "Real Hospital")?.isDemo).toBe(false);
    const slots = (await request(app).get(`/api/v1/hospitals/${demo[0]?.id}/availability?limit=5`).set(bearer(p1))).body.data as Array<{ id: string; status: string }>;
    expect(slots).toHaveLength(5);
    expect(slots.every((s) => s.status === "open")).toBe(true);
    expect((await request(app).post("/api/v1/appointments").set(bearer(p1)).send({ slotId: slots[0]?.id })).status).toBe(201);
    expect((await request(app).post("/api/v1/appointments").set(bearer(p2)).send({ slotId: slots[0]?.id })).status).toBe(409);
  });

  it("records the load in the audit log with counts only", async () => {
    const events = await h.db.auditEvent.findMany({ where: { action: "seed.demo_loaded" } });
    expect(events).toHaveLength(2);
    expect(events[0]?.metadata).toMatchObject({ usersCreated: 4, hospitalsCreated: 3 });
    expect(JSON.stringify(events)).not.toContain(PASSWORD);
  });
});
