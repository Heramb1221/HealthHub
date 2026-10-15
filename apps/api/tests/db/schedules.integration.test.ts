import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockExtractionProvider } from "../../src/extraction/mockProvider.js";
import { LocalFileStore } from "../../src/storage/localFileStore.js";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, loginToken, registerPatient, seedUser, testEnv } from "./appHelpers.js";
import { rxKit } from "./rxHelpers.js";

const DAY = 86_400_000;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const FULL = (name: string) => ({ name, strength: "250 mg", dose: "1 tablet", frequency: "daily" });

describe.skipIf(!TEST_DATABASE_URL)("medication schedules and dose events", () => {
  let h: Harness;
  let root: string;
  let app: ReturnType<typeof buildApp>;
  let kit: ReturnType<typeof rxKit>;
  const url = TEST_DATABASE_URL as string;

  beforeAll(async () => {
    h = await openHarness(url);
    root = await mkdtemp(join(tmpdir(), "hh-sched-test-"));
    app = buildApp(h.db, testEnv(url), undefined, new LocalFileStore(root), new MockExtractionProvider());
    kit = rxKit(app, h);
  });
  afterAll(async () => {
    await closeHarness(h);
    await rm(root, { recursive: true, force: true });
  });

  const create = (token: string | undefined, body: unknown, target = app) =>
    request(target).post("/api/v1/medication-schedules").set(token ? bearer(token) : {}).send(body as object);
  const list = (token: string | undefined, q = "") => request(app).get(`/api/v1/medication-schedules${q}`).set(token ? bearer(token) : {});
  const patch = (token: string | undefined, id: string, body: unknown) =>
    request(app).patch(`/api/v1/medication-schedules/${id}`).set(token ? bearer(token) : {}).send(body as object);
  const dose = (token: string | undefined, id: string, body: unknown) =>
    request(app).post(`/api/v1/medication-schedules/${id}/dose-events`).set(token ? bearer(token) : {}).send(body as object);
  const body = (rx: string, version: number, position: number, o: Record<string, unknown> = {}) => ({
    prescriptionId: rx, versionNumber: version, medicationPosition: position, startDate: day(0), timezone: "UTC", ...o,
  });
  const auditOf = (action: string, resourceId: string) => h.db.auditEvent.findMany({ where: { action, resourceId } });

  /** clear-001 extracted, then reviewed by the patient: version 2, both rows confident and complete. */
  async function reviewed(token: string) {
    const rx = await kit.processed(token, "clear-001");
    expect((await kit.correct(token, rx, { baseVersionNumber: 1, prescriberName: "Dr. Reviewed (synthetic)" })).status).toBe(201);
    return rx;
  }
  /** A prescription with one version added directly, for states the API cannot reach yet. */
  async function withVersion(token: string, status: string, meds: Array<Record<string, unknown>>, kind: "extraction" | "patient_correction" = "patient_correction") {
    const rx = await kit.uploadFixture(token, "clear-001");
    await h.db.prescriptionVersion.create({
      data: {
        prescriptionId: rx, versionNumber: 1, kind, verificationStatus: status as never,
        medications: { create: meds.map((m, position) => ({ position, confidence: 1, ...m })) as never },
      },
    });
    return rx;
  }

  describe("the safety gate", () => {
    it("refuses an unreviewed prescription however confident the reading, and audits why", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await kit.processed(p.token, "clear-001"); // unverified, row 0 complete at 0.97
      const res = await create(p.token, body(rx, 1, 0));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
      expect(res.body.error.message).toMatch(/reviewed and confirmed/);
      expect(await h.db.medicationSchedule.count({ where: { patientId: p.patientId } })).toBe(0);
      const refusals = await auditOf("schedule.refused", rx);
      expect(refusals).toHaveLength(1);
      expect(refusals[0]?.metadata).toEqual({ reason: "not_reviewed", versionNumber: 1, medicationPosition: 0 });
      expect(refusals[0]?.outcome).toBe("denied");
    });

    it("refuses needs_review versions too", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await kit.processed(p.token, "ambiguous-001");
      expect((await create(p.token, body(rx, 1, 2))).status).toBe(409); // row 2 is complete and 0.9, still not reviewed
    });

    it("allows a reviewed, complete, confident row, copying its text exactly", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await reviewed(p.token);
      const res = await create(p.token, body(rx, 2, 0, { endDate: day(5), reminderTimes: ["20:00", "08:00"], remindersEnabled: true }));
      expect(res.status).toBe(201);
      expect(Object.keys(res.body.data).sort()).toEqual([
        "createdAt", "endDate", "id", "isActive", "medication", "notice", "prescriptionId", "recentDoseEvents", "reminderTimes", "remindersActive",
        "remindersEnabled", "sourceStatus", "sourceVersionNumber", "startDate", "timezone", "updatedAt",
      ]);
      expect(res.body.data).toMatchObject({
        prescriptionId: rx, sourceVersionNumber: 2, sourceStatus: "current", isActive: true, remindersEnabled: true, remindersActive: true,
        reminderTimes: ["08:00", "20:00"], startDate: day(0), endDate: day(5), timezone: "UTC", recentDoseEvents: [],
        medication: { name: "Examplecillin", strength: "250 mg", dose: "1 tablet", route: "oral", frequency: "three times daily", duration: "5 days", instructions: "After food" },
      });
      expect(res.body.data.notice).toMatch(/not medical advice/);
      const source = await h.db.prescriptionMedication.findFirstOrThrow({ where: { version: { prescriptionId: rx, versionNumber: 2 }, position: 0 } });
      const row = await h.db.medicationSchedule.findUniqueOrThrow({ where: { id: res.body.data.id } });
      expect(row.sourceMedicationId).toBe(source.id);
    });

    it("refuses rows with missing name, strength, dose, or frequency, even after review", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await kit.processed(p.token, "ambiguous-001");
      await kit.correct(p.token, rx, { baseVersionNumber: 1, prescriberName: "Dr. Reviewed (synthetic)" }); // v2: reviewed, rows unchanged
      for (const position of [0, 1]) {
        const res = await create(p.token, body(rx, 2, position)); // dose missing, strength missing
        expect(res.status, `row ${position}`).toBe(409);
        expect(res.body.error.message).toMatch(/Name, strength, dose, and frequency/);
      }
      expect((await create(p.token, body(rx, 2, 2))).status).toBe(201); // Samplex: complete and 0.9
    });

    it("refuses a complete row with low confidence until the patient confirms or edits it", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await withVersion(p.token, "patient_corrected", [{ ...FULL("Lowconf"), confidence: 0.6 }]);
      const refused = await create(p.token, body(rx, 1, 0));
      expect(refused.status).toBe(409);
      expect(refused.body.error.message).toMatch(/confirmed clearly enough/);
      expect((await auditOf("schedule.refused", rx))[0]?.metadata).toMatchObject({ reason: "low_confidence" });

      // Confirm the row without changing its text.
      const confirm = await kit.correct(p.token, rx, { baseVersionNumber: 1, medications: [{ ...FULL("Lowconf"), confirmed: true }] });
      expect(confirm.status).toBe(201);
      expect(confirm.body.data.changedFields).toEqual(["medications.0.confirmed"]);
      expect(confirm.body.data.medications[0].confidence).toBe(1);
      expect((await create(p.token, body(rx, 2, 0))).status).toBe(201);
    });

    it("accepts a clinician-verified version", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await withVersion(p.token, "verified_by_authorized_clinician", [FULL("Verified")]);
      expect((await create(p.token, body(rx, 1, 0))).status).toBe(201);
    });

    it("refuses junk that merely looks filled in", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await withVersion(p.token, "patient_corrected", [{ name: "Junk", strength: "???", dose: "1", frequency: "-" }]);
      expect((await create(p.token, body(rx, 1, 0))).status).toBe(409);
    });

    it("requires the version the patient saw, so a different row can never be scheduled by mistake", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await reviewed(p.token); // latest is 2
      for (const stale of [1, 3]) {
        const res = await create(p.token, body(rx, stale, 0));
        expect(res.status, `version ${stale}`).toBe(409);
      }
      expect((await auditOf("schedule.refused", rx)).map((e) => (e.metadata as { reason: string }).reason)).toEqual(["version_changed", "version_changed"]);
      expect(await h.db.medicationSchedule.count({ where: { patientId: p.patientId } })).toBe(0);
    });

    it("refuses a prescription with no version yet, and an unknown medication position", async () => {
      const p = await registerPatient(app, h.db);
      const bare = await kit.uploadFixture(p.token, "clear-001");
      expect((await create(p.token, body(bare, 1, 0))).status).toBe(409);
      const rx = await reviewed(p.token);
      expect((await create(p.token, body(rx, 2, 9))).status).toBe(404);
    });

    it("audits creation with ids only, never the medication text", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await reviewed(p.token);
      const res = await create(p.token, body(rx, 2, 0));
      const events = await auditOf("schedule.created", res.body.data.id);
      expect(events).toHaveLength(1);
      expect(events[0]?.metadata).toEqual({ prescriptionId: rx, versionNumber: 2, medicationPosition: 0 });
      expect(JSON.stringify(events)).not.toMatch(/Examplecillin|250 mg|tablet/);
    });
  });

  describe("limits and duplicates", () => {
    it("allows one active schedule per medication, and a new one only after stopping the old", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await reviewed(p.token);
      const first = await create(p.token, body(rx, 2, 0));
      expect((await create(p.token, body(rx, 2, 0))).status).toBe(409);
      expect((await create(p.token, body(rx, 2, 1))).status).toBe(201); // a different medication is fine
      expect((await patch(p.token, first.body.data.id, { isActive: false })).status).toBe(200);
      const second = await create(p.token, body(rx, 2, 0));
      expect(second.status).toBe(201);
      // The stopped one cannot be switched back on while another is active.
      expect((await patch(p.token, first.body.data.id, { isActive: true })).status).toBe(409);
    });

    it("caps active schedules per patient", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await reviewed(p.token);
      const med = await h.db.prescriptionMedication.findFirstOrThrow({ where: { version: { prescriptionId: rx, versionNumber: 2 }, position: 0 } });
      await h.db.medicationSchedule.createMany({
        data: Array.from({ length: 50 }, () => ({
          patientId: p.patientId, sourceMedicationId: med.id, medicationName: "Filler", strength: "1", dose: "1", frequency: "daily", startDate: new Date(day(0)), timezone: "UTC",
        })),
      });
      const res = await create(p.token, body(rx, 2, 1));
      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/Too many active schedules/);
    });

    it("waits for the patient's row lock instead of racing past the limits", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await reviewed(p.token);
      await h.pg.query("BEGIN");
      await h.pg.query(`SELECT "id" FROM "Patient" WHERE "id" = $1 FOR NO KEY UPDATE`, [p.patientId]);
      try {
        let finished = false;
        const pending = create(p.token, body(rx, 2, 0)).then((r) => {
          finished = true;
          return r;
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(finished).toBe(false);
        await h.pg.query("COMMIT");
        expect((await pending).status).toBe(201);
      } finally {
        await h.pg.query("ROLLBACK").catch(() => undefined);
      }
    });

    it("lets exactly one of simultaneous identical requests through", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await reviewed(p.token);
      const results = await Promise.all(Array.from({ length: 5 }, () => create(p.token, body(rx, 2, 0))));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
      expect(await h.db.medicationSchedule.count({ where: { patientId: p.patientId } })).toBe(1);
    });
  });

  describe("when the prescription changes after a schedule was made", () => {
    it("flags the schedule and switches reminders off if the medication changed or was removed, but not for unrelated edits", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await reviewed(p.token); // v2
      const s0 = (await create(p.token, body(rx, 2, 0, { reminderTimes: ["08:00"], remindersEnabled: true }))).body.data;
      const s1 = (await create(p.token, body(rx, 2, 1, { reminderTimes: ["09:00"], remindersEnabled: true }))).body.data;
      expect(s0.remindersActive).toBe(true);

      // An unrelated edit (prescriber) leaves both current.
      await kit.correct(p.token, rx, { baseVersionNumber: 2, prescriberName: "Dr. Someone Else" }); // v3
      let rows = (await list(p.token)).body.data as Array<{ id: string; sourceStatus: string; remindersActive: boolean }>;
      expect(rows.every((r) => r.sourceStatus === "current" && r.remindersActive)).toBe(true);

      // Change medication 0's dose and drop medication 1.
      const v3 = (await kit.versionsOf(rx))[2];
      const row0 = v3?.medications[0];
      await kit.correct(p.token, rx, {
        baseVersionNumber: 3,
        medications: [{ name: row0?.name, strength: row0?.strength, dose: "2 tablets", route: row0?.route, frequency: row0?.frequency, duration: row0?.duration, instructions: row0?.instructions }],
      }); // v4
      rows = (await list(p.token)).body.data;
      const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(byId[s0.id]).toMatchObject({ sourceStatus: "changed", remindersActive: false });
      expect(byId[s1.id]).toMatchObject({ sourceStatus: "removed", remindersActive: false });
      // Reminders are still the patient's setting; they are just not active.
      expect((await list(p.token)).body.data.every((r: { remindersEnabled: boolean }) => r.remindersEnabled)).toBe(true);
      // The schedule still shows what it was made from, not the new dose.
      expect(((await list(p.token)).body.data as Array<{ id: string; medication: { dose: string } }>).find((r) => r.id === s0.id)?.medication.dose).toBe("1 tablet");
      // A changed schedule cannot be switched back on after being stopped.
      await patch(p.token, s0.id, { isActive: false });
      expect((await patch(p.token, s0.id, { isActive: true })).status).toBe(409);
    });

    it("only reminds inside the schedule's dates", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await reviewed(p.token);
      const timed = { reminderTimes: ["08:00"], remindersEnabled: true };
      const future = await create(p.token, body(rx, 2, 0, { ...timed, startDate: day(3) }));
      expect(future.body.data.remindersActive).toBe(false);
      const past = await create(p.token, body(rx, 2, 1, { ...timed, startDate: day(-5), endDate: day(-1) }));
      expect(past.body.data.remindersActive).toBe(false);
      expect(past.body.data.remindersEnabled).toBe(true);
    });
  });

  describe("editing a schedule", () => {
    async function one() {
      const p = await registerPatient(app, h.db);
      const rx = await reviewed(p.token);
      const s = (await create(p.token, body(rx, 2, 0, { reminderTimes: ["08:00"], remindersEnabled: true, endDate: day(10) }))).body.data;
      return { p, rx, s };
    }

    it("changes reminder preferences, end date, time zone, and active state, and audits field names only", async () => {
      const { p, s } = await one();
      const res = await patch(p.token, s.id, { reminderTimes: ["21:00", "07:00"], remindersEnabled: false, timezone: "Asia/Kolkata", endDate: null });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ reminderTimes: ["07:00", "21:00"], remindersEnabled: false, remindersActive: false, endDate: null });
      expect(["Asia/Kolkata", "Asia/Calcutta"]).toContain(res.body.data.timezone);
      const events = await auditOf("schedule.updated", s.id);
      expect(events).toHaveLength(1);
      expect((events[0]?.metadata as { changedFields: string[] }).changedFields.sort()).toEqual(["endDate", "remindersEnabled", "reminderTimes", "timezone"].sort());
      expect(JSON.stringify(events)).not.toMatch(/07:00|21:00|Kolkata/);
      // A request that changes nothing writes nothing.
      await patch(p.token, s.id, { remindersEnabled: false });
      expect(await auditOf("schedule.updated", s.id)).toHaveLength(1);
    });

    it("cannot change what the medication is or how much to take", async () => {
      const { p, s } = await one();
      const before = await h.db.medicationSchedule.findUniqueOrThrow({ where: { id: s.id } });
      for (const bad of [{ dose: "99" }, { medicationName: "x" }, { strength: "x" }, { frequency: "hourly" }, { startDate: day(-3) }, { sourceMedicationId: s.id }, { prescriptionId: s.id }]) {
        expect((await patch(p.token, s.id, bad)).status, JSON.stringify(bad)).toBe(400);
      }
      // Mixed with a legitimate field: still an error, never silently ignored.
      expect((await patch(p.token, s.id, { isActive: true, dose: "99" })).status).toBe(400);
      expect((await patch(p.token, s.id, { remindersEnabled: false, medicationName: "x" })).status).toBe(400);
      const after = await h.db.medicationSchedule.findUniqueOrThrow({ where: { id: s.id } });
      for (const key of ["medicationName", "strength", "dose", "route", "frequency", "duration", "instructions", "startDate", "sourceMedicationId"] as const) {
        expect(after[key]).toEqual(before[key]);
      }
    });

    it("validates edits", async () => {
      const { p, s } = await one();
      await patch(p.token, s.id, { reminderTimes: [], remindersEnabled: false });
      for (const bad of [{}, { remindersEnabled: true }, { endDate: day(-1) }, { reminderTimes: ["25:00"] }, { timezone: "IST" }, { isActive: "yes" }]) {
        expect((await patch(p.token, s.id, bad)).status, JSON.stringify(bad)).toBe(400);
      }
    });

    it("hides other patients' schedules, and refuses providers, admins, and anonymous callers", async () => {
      const { p, s } = await one();
      const other = await registerPatient(app, h.db);
      expect((await patch(other.token, s.id, { isActive: false })).status).toBe(404);
      expect((await dose(other.token, s.id, { scheduledFor: new Date().toISOString(), status: "taken" })).status).toBe(404);
      expect((await h.db.medicationSchedule.findUniqueOrThrow({ where: { id: s.id } })).isActive).toBe(true);
      const provider = await seedUser(h.db, "provider");
      await h.db.consent.create({ data: { patientId: p.patientId, granteeUserId: provider.id, resourceScope: "medication_schedules:read", purpose: "visit" } });
      const admin = await seedUser(h.db, "admin");
      for (const u of [provider, admin]) {
        const token = await loginToken(app, u.email);
        expect((await list(token)).status).toBe(403);
        expect((await create(token, body(s.prescriptionId, 2, 1))).status).toBe(403);
        expect((await patch(token, s.id, { isActive: false })).status).toBe(403);
        expect((await dose(token, s.id, { scheduledFor: new Date().toISOString(), status: "taken" })).status).toBe(403);
      }
      for (const f of [() => list(undefined), () => create(undefined, {}), () => patch(undefined, s.id, {}), () => dose(undefined, s.id, {})]) expect((await f()).status).toBe(401);
      for (const bad of ["00000000-0000-4000-8000-000000000000", "not-a-uuid", "%00"]) {
        expect((await patch(p.token, bad, { isActive: false })).status, bad).toBe(404);
        expect((await dose(p.token, bad, { scheduledFor: new Date().toISOString(), status: "taken" })).status, bad).toBe(404);
      }
    });

    it("refuses a former patient whose role changed, though their patient row and schedule still exist", async () => {
      for (const role of ["provider", "admin"] as const) {
        const { p, s } = await one();
        expect((await list(p.token)).status).toBe(200);
        await h.db.user.update({ where: { id: p.userId }, data: { role } });
        expect((await list(p.token)).status, `${role} list`).toBe(403);
        expect((await create(p.token, body(s.prescriptionId, 2, 1))).status, `${role} create`).toBe(403);
        expect((await patch(p.token, s.id, { isActive: false })).status, `${role} patch`).toBe(403);
        expect((await dose(p.token, s.id, { scheduledFor: new Date().toISOString(), status: "taken" })).status, `${role} dose`).toBe(403);
        const row = await h.db.medicationSchedule.findUniqueOrThrow({ where: { id: s.id } });
        expect(row.isActive).toBe(true);
        expect(await h.db.doseEvent.count({ where: { scheduleId: s.id } })).toBe(0);
        expect(await h.db.medicationSchedule.count({ where: { patientId: p.patientId } })).toBe(1);
      }
    });

    it("refuses another patient's prescription when creating (audited)", async () => {
      const owner = await registerPatient(app, h.db);
      const rx = await reviewed(owner.token);
      const other = await registerPatient(app, h.db);
      expect((await create(other.token, body(rx, 2, 0))).status).toBe(403);
      expect(await h.db.auditEvent.count({ where: { action: "access.denied", actorUserId: other.userId, patientId: owner.patientId, resourceId: rx } })).toBe(1);
      expect(await h.db.medicationSchedule.count({ where: { patientId: other.patientId } })).toBe(0);
    });
  });

  describe("listing", () => {
    it("shows only the caller's schedules, newest first, with paging", async () => {
      const a = await registerPatient(app, h.db);
      const b = await registerPatient(app, h.db);
      const rxA = await reviewed(a.token);
      await reviewed(b.token).then((rx) => create(b.token, body(rx, 2, 0)));
      const ids: string[] = [];
      for (const position of [0, 1]) ids.push((await create(a.token, body(rxA, 2, position))).body.data.id);
      const res = await list(a.token);
      expect(res.body.data.map((s: { id: string }) => s.id)).toEqual([ids[1], ids[0]]);
      const first = await list(a.token, "?limit=1");
      expect(first.body.data).toHaveLength(1);
      const second = await list(a.token, `?limit=1&cursor=${first.body.page.nextCursor}`);
      expect(second.body.data[0].id).toBe(ids[0]);
      expect(second.body.page.nextCursor).toBeNull();
      for (const q of ["?limit=0", "?limit=101", "?cursor=x", "?x=1"]) expect((await list(a.token, q)).status, q).toBe(400);
    });

    it("never exposes storage details or account data", async () => {
      const p = await registerPatient(app, h.db);
      const rx = await reviewed(p.token);
      await create(p.token, body(rx, 2, 0));
      const text = JSON.stringify((await list(p.token)).body);
      for (const hidden of ["originalStorageKey", "originalSha256", p.email, p.userId, "sourceMedicationId", "patientId"]) expect(text).not.toContain(hidden);
    });
  });

  describe("dose events", () => {
    async function active(o: Record<string, unknown> = {}) {
      const p = await registerPatient(app, h.db);
      const rx = await reviewed(p.token);
      const s = (await create(p.token, body(rx, 2, 0, { startDate: day(-3), ...o }))).body.data;
      return { p, s };
    }
    const at = (offsetMinutes: number) => new Date(Date.now() + offsetMinutes * 60_000).toISOString();

    it("records a taken or skipped dose, labelled as self-reported, and shows it on the schedule", async () => {
      const { p, s } = await active();
      const t1 = at(-120);
      const taken = await dose(p.token, s.id, { scheduledFor: t1, status: "taken" });
      expect(taken.status).toBe(201);
      expect(taken.body.data).toMatchObject({ scheduleId: s.id, scheduledFor: t1, status: "taken", selfReported: true });
      expect((await dose(p.token, s.id, { scheduledFor: at(-1500), status: "skipped" })).status).toBe(201);
      const events = (await list(p.token)).body.data[0].recentDoseEvents;
      expect(events.map((e: { status: string }) => e.status)).toEqual(["taken", "skipped"]);
      expect(events.every((e: { selfReported: boolean }) => e.selfReported === true)).toBe(true);
    });

    it("refuses a second record for the same time, and the log cannot be edited", async () => {
      const { p, s } = await active();
      const t = at(-60);
      expect((await dose(p.token, s.id, { scheduledFor: t, status: "taken" })).status).toBe(201);
      const again = await dose(p.token, s.id, { scheduledFor: t, status: "skipped" });
      expect(again.status).toBe(409);
      expect(await h.db.doseEvent.count({ where: { scheduleId: s.id } })).toBe(1);
      expect((await h.db.doseEvent.findFirstOrThrow({ where: { scheduleId: s.id } })).status).toBe("taken");
      const ev = await h.db.doseEvent.findFirstOrThrow({ where: { scheduleId: s.id } });
      await expect(h.pg.query(`UPDATE "DoseEvent" SET "status" = 'skipped' WHERE "id" = $1`, [ev.id])).rejects.toMatchObject({ code: "55000" });
      await expect(h.pg.query(`DELETE FROM "DoseEvent" WHERE "id" = $1`, [ev.id])).rejects.toMatchObject({ code: "55000" });
    });

    it("keeps doses inside the schedule and not in the future", async () => {
      const { p, s } = await active({ startDate: day(-2), endDate: day(1) });
      expect((await dose(p.token, s.id, { scheduledFor: at(-60 * 24 * 10), status: "taken" })).status).toBe(400); // before it started
      expect((await dose(p.token, s.id, { scheduledFor: at(60 * 24 * 3), status: "taken" })).status).toBe(400); // far future
      expect((await dose(p.token, s.id, { scheduledFor: at(90), status: "taken" })).status).toBe(400); // over an hour ahead
      expect((await dose(p.token, s.id, { scheduledFor: at(30), status: "taken" })).status).toBe(201); // a little early is fine
      const { p: p2, s: s2 } = await active({ startDate: day(-5), endDate: day(-2) });
      expect((await dose(p2.token, s2.id, { scheduledFor: at(-30), status: "taken" })).status).toBe(400); // after it ended
    });

    it("refuses doses for a stopped schedule", async () => {
      const { p, s } = await active();
      await patch(p.token, s.id, { isActive: false });
      expect((await dose(p.token, s.id, { scheduledFor: at(-30), status: "taken" })).status).toBe(409);
    });

    it("lists only recent events on the schedule", async () => {
      const { p, s } = await active({ startDate: day(-30) });
      await dose(p.token, s.id, { scheduledFor: at(-60 * 24 * 3), status: "taken" });
      await h.db.doseEvent.create({ data: { scheduleId: s.id, scheduledFor: new Date(Date.now() - 20 * DAY), status: "taken" } });
      const events = (await list(p.token)).body.data[0].recentDoseEvents;
      expect(events).toHaveLength(1);
    });

    it("validates the body", async () => {
      const { p, s } = await active();
      const bad: unknown[] = [{}, { status: "taken" }, { scheduledFor: at(-5) }, { scheduledFor: "2026-10-12T08:00:00", status: "taken" }, { scheduledFor: at(-5), status: "missed" }, { scheduledFor: at(-5), status: "taken", selfReported: false }, { scheduledFor: at(-5), status: "taken", verified: true }];
      for (const b of bad) expect((await dose(p.token, s.id, b)).status, JSON.stringify(b)).toBe(400);
    });
  });

  it("never causes a server error on hostile bodies", async () => {
    const p = await registerPatient(app, h.db);
    const rx = await reviewed(p.token);
    const s = (await create(p.token, body(rx, 2, 0))).body.data;
    const raw = ["null", "[]", '"x"', "{bad", "", '{"__proto__":{"a":1}}', '{"prescriptionId":{"$ne":null}}', '{"versionNumber":1e999}', JSON.stringify({ reminderTimes: Array.from({ length: 9999 }, () => "08:00") })];
    const targets: Array<[string, string]> = [["post", "/api/v1/medication-schedules"], ["patch", `/api/v1/medication-schedules/${s.id}`], ["post", `/api/v1/medication-schedules/${s.id}/dose-events`]];
    for (const [method, path] of targets) {
      for (const r of raw) {
        const pending = method === "post" ? request(app).post(path) : request(app).patch(path);
        const res = await pending.set("Content-Type", "application/json").set(bearer(p.token)).send(r);
        expect(res.status, `${method} ${path.slice(-12)} ${r.slice(0, 30)}`).toBeGreaterThanOrEqual(400);
        expect(res.status, `${method} ${r.slice(0, 30)}`).toBeLessThan(500);
      }
    }
  });
});
