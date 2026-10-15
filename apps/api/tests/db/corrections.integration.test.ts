import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockExtractionProvider } from "../../src/extraction/mockProvider.js";
import type { ExtractionInput, ExtractionProvider } from "../../src/extraction/types.js";
import { LocalFileStore } from "../../src/storage/localFileStore.js";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, loginToken, registerPatient, seedUser, testEnv } from "./appHelpers.js";
import { rxKit } from "./rxHelpers.js";

const mock = new MockExtractionProvider();
const delayed = (ms: number): ExtractionProvider => ({
  name: "mock-synthetic",
  extract: async (input: ExtractionInput) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return mock.extract(input);
  },
});

describe.skipIf(!TEST_DATABASE_URL)("patient corrections", () => {
  let h: Harness;
  let root: string;
  let store: LocalFileStore;
  let app: ReturnType<typeof buildApp>;
  let kit: ReturnType<typeof rxKit>;
  const url = TEST_DATABASE_URL as string;

  beforeAll(async () => {
    h = await openHarness(url);
    root = await mkdtemp(join(tmpdir(), "hh-corr-test-"));
    store = new LocalFileStore(root);
    app = buildApp(h.db, testEnv(url), undefined, store, mock);
    kit = rxKit(app, h);
  });
  afterAll(async () => {
    await closeHarness(h);
    await rm(root, { recursive: true, force: true });
  });

  const medsOf = (res: { body: { data: { medications: Array<Record<string, unknown>> } } }) => res.body.data.medications;

  describe("making a correction", () => {
    it("creates a new patient_corrected version, leaving the extraction and the original file untouched", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "clear-001");
      const before = await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id } });
      const v1Before = (await kit.versionsOf(id))[0];

      const res = await kit.correct(p.token, id, {
        baseVersionNumber: 1,
        medications: [
          { name: "Examplecillin", strength: "250 mg", dose: "2 tablets", route: "oral", frequency: "three times daily", duration: "5 days", instructions: "After food" },
        ],
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        versionNumber: 2,
        kind: "patient_correction",
        verificationStatus: "patient_corrected",
        extractionProvider: null,
        extractionConfidence: null,
        prescriberName: "Dr. A. Example (synthetic)", // omitted fields carry over
        prescriptionDate: "2026-09-01",
        changedFields: ["medications.0.dose", "medications.1.removed"],
      });
      expect(medsOf(res)).toHaveLength(1);
      expect(medsOf(res)[0]).toMatchObject({ dose: "2 tablets", confidence: 1 }); // edited row: stated by a person

      // Version 1 is exactly as it was.
      const versions = await kit.versionsOf(id);
      expect(versions.map((v) => v.versionNumber)).toEqual([1, 2]);
      expect(versions[0]).toEqual(v1Before);
      expect(versions[0]?.medications).toHaveLength(2);
      expect(versions[0]?.medications[0]?.dose).toBe("1 tablet");

      // The original upload is untouched.
      const after = await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id } });
      for (const key of ["originalStorageKey", "originalFileName", "originalMimeType", "originalSizeBytes", "originalSha256"] as const) {
        expect(after[key]).toEqual(before[key]);
      }
      expect(after.processingStatus).toBe("completed");

      const row = versions[1];
      expect(row?.createdByUserId).toBe(p.userId);
    });

    it("shows up everywhere the record is read: record, latest, and history", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "clear-001");
      await kit.correct(p.token, id, { baseVersionNumber: 1, prescriberName: "Dr. Corrected (synthetic)" });

      const record = await kit.get(p.token, `/prescriptions/${id}`);
      expect(record.body.data.verificationStatus).toBe("patient_corrected");
      expect(record.body.data.prescriberName).toBe("Dr. Corrected (synthetic)");
      expect(record.body.data.medications).toHaveLength(2);
      const latest = await kit.get(p.token, `/prescriptions/${id}/latest`);
      expect(latest.body.data).toMatchObject({ versionNumber: 2, kind: "patient_correction", verificationStatus: "patient_corrected" });
      const history = await kit.get(p.token, `/prescriptions/${id}/versions`);
      expect(history.body.data.map((v: { versionNumber: number; verificationStatus: string }) => [v.versionNumber, v.verificationStatus])).toEqual([
        [2, "patient_corrected"],
        [1, "unverified"],
      ]);
    });

    it("keeps the previous confidence for unchanged rows and gives edited or added rows 1", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "ambiguous-001"); // confidences 0.55, 0.4, 0.9
      const v1 = (await kit.versionsOf(id))[0];
      const original = v1?.medications.map((m) => ({
        name: m.name, strength: m.strength, dose: m.dose, route: m.route, frequency: m.frequency, duration: m.duration, instructions: m.instructions,
      })) as Array<Record<string, string | null>>;

      const res = await kit.correct(p.token, id, {
        baseVersionNumber: 1,
        medications: [
          original[0], // unchanged: keeps 0.55
          { ...original[1], strength: "5 mg" }, // edited: 1
          original[2], // unchanged: keeps 0.9
          { name: "Added by patient", dose: "1" }, // added: 1
        ],
      });
      expect(res.status).toBe(201);
      expect(medsOf(res).map((m) => m.confidence)).toEqual([0.55, 1, 0.9, 1]);
      expect(res.body.data.changedFields).toEqual(["medications.1.strength", "medications.3.added"]);
    });

    it("lets the patient explicitly confirm a row: it reaches confidence 1 and the history says so", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "ambiguous-001"); // 0.55, 0.4, 0.9
      const v1 = (await kit.versionsOf(id))[0];
      const rows = v1?.medications.map((m) => ({
        name: m.name, strength: m.strength, dose: m.dose, route: m.route, frequency: m.frequency, duration: m.duration, instructions: m.instructions,
      })) as Array<Record<string, string | null>>;
      const res = await kit.correct(p.token, id, {
        baseVersionNumber: 1,
        medications: [
          { ...rows[0], confirmed: true }, // unchanged text, confirmed: 0.55 -> 1
          { ...rows[1], strength: "5 mg" }, // edited: already 1, no separate "confirmed" entry
          { ...rows[2], confirmed: true }, // 0.9 -> 1
        ],
      });
      expect(res.status).toBe(201);
      expect(medsOf(res).map((m) => m.confidence)).toEqual([1, 1, 1]);
      expect(res.body.data.changedFields).toEqual(["medications.0.confirmed", "medications.1.strength", "medications.2.confirmed"]);
    });

    it("does not list a confirmation for a row that was already at confidence 1, or one that was removed", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "clear-001");
      await kit.correct(p.token, id, { baseVersionNumber: 1, medications: [{ name: "Entered", dose: "1" }] }); // v2: one row at 1
      const res = await kit.correct(p.token, id, { baseVersionNumber: 2, medications: [{ name: "Entered", dose: "1", confirmed: true }] });
      expect(res.body.data.changedFields).toEqual([]);
    });

    it("records a confirmation with no edits as a review, with empty changedFields", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "clear-001");
      const v1 = (await kit.versionsOf(id))[0];
      const same = v1?.medications.map((m) => ({
        name: m.name, strength: m.strength, dose: m.dose, route: m.route, frequency: m.frequency, duration: m.duration, instructions: m.instructions,
      }));
      const res = await kit.correct(p.token, id, { baseVersionNumber: 1, medications: same });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ verificationStatus: "patient_corrected", changedFields: [] });
      expect(medsOf(res).map((m) => m.confidence)).toEqual([0.97, 0.95]);
    });

    it("keeps medications and their confidences when only other fields are sent, and can clear fields with null", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "clear-001");
      const res = await kit.correct(p.token, id, { baseVersionNumber: 1, prescriptionDate: null, prescriberName: null });
      expect(res.body.data).toMatchObject({ prescriptionDate: null, prescriberName: null, changedFields: ["prescriptionDate", "prescriberName"] });
      expect(medsOf(res).map((m) => m.confidence)).toEqual([0.97, 0.95]);
      expect(medsOf(res)[0]).toMatchObject({ name: "Examplecillin" });
    });

    it("always stores patient_corrected, never a verified status", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "clear-001");
      for (let n = 1; n <= 3; n += 1) await kit.correct(p.token, id, { baseVersionNumber: n, prescriberName: `Dr ${n}` });
      const versions = await kit.versionsOf(id);
      expect(versions.map((v) => v.verificationStatus)).toEqual(["unverified", "patient_corrected", "patient_corrected", "patient_corrected"]);
    });

    it("audits with version numbers and field names only, never values", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "clear-001");
      await kit.correct(p.token, id, {
        baseVersionNumber: 1,
        prescriberName: "Dr. Very Private Name",
        medications: [{ name: "SecretDrugName", dose: "99 units" }],
      });
      const events = await kit.auditOf("prescription.corrected", id);
      expect(events).toHaveLength(1);
      expect(events[0]?.metadata).toMatchObject({ versionNumber: 2, baseVersionNumber: 1 });
      const stored = JSON.stringify(events);
      for (const value of ["Very Private", "SecretDrugName", "99 units", "Examplecillin"]) expect(stored).not.toContain(value);
    });

    it("appears in the patient's own access history, as their own action", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "clear-001");
      await kit.correct(p.token, id, { baseVersionNumber: 1, prescriberName: "Dr X" });
      const res = await kit.get(p.token, "/patients/me/access-history");
      const event = res.body.data.find((e: { action: string }) => e.action === "prescription.corrected");
      expect(event).toBeDefined();
      expect(event.actor).toEqual({ type: "self" });
      expect(event.details).toMatchObject({ versionNumber: 2, changedFields: ["prescriberName"] });
      expect(JSON.stringify(res.body)).not.toContain("Dr X");
    });
  });

  describe("conflicts", () => {
    it("rejects an edit based on an out-of-date version, and creates nothing", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "clear-001");
      expect((await kit.correct(p.token, id, { baseVersionNumber: 1, prescriberName: "First" })).status).toBe(201);
      for (const stale of [0, 1, 3, 99]) {
        const res = await kit.correct(p.token, id, { baseVersionNumber: stale, prescriberName: "Second" });
        expect(res.status, `base ${stale}`).toBe(409);
        expect(res.body.error.code).toBe("CONFLICT");
      }
      expect(await kit.versionsOf(id)).toHaveLength(2);
    });

    it("lets exactly one of many simultaneous corrections win", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "clear-001");
      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => kit.correct(p.token, id, { baseVersionNumber: 1, prescriberName: `Racer ${i}` })));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(5);
      expect(await kit.versionsOf(id)).toHaveLength(2);
      expect(await kit.auditOf("prescription.corrected", id)).toHaveLength(1);
    });
  });

  describe("serialising corrections", () => {
    it("waits for the record's row lock instead of racing past it", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "clear-001");

      // Hold a lock that conflicts with the one corrections take, from a separate connection.
      // (NO KEY UPDATE conflicts with FOR UPDATE but not with the foreign-key checks, so only the
      // explicit lock in the correction code can make it wait.)
      await h.pg.query("BEGIN");
      await h.pg.query(`SELECT "id" FROM "PrescriptionRecord" WHERE "id" = $1 FOR NO KEY UPDATE`, [id]);
      try {
        let finished = false;
        const pending = kit.correct(p.token, id, { baseVersionNumber: 1, prescriberName: "Waited" }).then((r) => {
          finished = true;
          return r;
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(finished).toBe(false);
        expect(await kit.versionsOf(id)).toHaveLength(1);
        await h.pg.query("COMMIT");
        const res = await pending;
        expect(res.status).toBe(201);
        expect(await kit.versionsOf(id)).toHaveLength(2);
      } finally {
        await h.pg.query("ROLLBACK").catch(() => undefined);
      }
    });

    it("builds on the newest version even when it was added outside the API", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "clear-001");
      // A version 2 that the client has already seen (so its base is 2).
      await h.db.prescriptionVersion.create({
        data: { prescriptionId: id, versionNumber: 2, kind: "patient_correction", verificationStatus: "patient_corrected", changedFields: [] },
      });
      const res = await kit.correct(p.token, id, { baseVersionNumber: 2, prescriberName: "Next" });
      expect(res.status).toBe(201); // base 2 is the real latest now: it becomes version 3
      expect(res.body.data.versionNumber).toBe(3);
    });
  });

  describe("entering data by hand", () => {
    it("lets a patient enter data for an illegible document, as version 1", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "illegible-001"); // extraction finds nothing
      const res = await kit.correct(p.token, id, {
        baseVersionNumber: 1,
        prescriberName: "Dr. Typed By Hand (synthetic)",
        medications: [{ name: "Examplecillin", strength: "250 mg", dose: "1 tablet", frequency: "daily" }],
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ versionNumber: 2, verificationStatus: "patient_corrected" });
      expect(res.body.data.changedFields).toEqual(["prescriberName", "medications.0.added"]);
    });

    it("lets a patient enter data when nothing has been extracted yet (base 0)", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.uploadFixture(p.token, "clear-001"); // uploaded, never processed
      const res = await kit.correct(p.token, id, { baseVersionNumber: 0, medications: [{ name: "Examplecillin", dose: "1 tablet" }] });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ versionNumber: 1, kind: "patient_correction", verificationStatus: "patient_corrected" });
      expect(res.body.data.changedFields).toEqual(["medications.0.added"]);
      expect((await kit.correct(p.token, id, { baseVersionNumber: 0, prescriberName: "x" })).status).toBe(409); // base 0 only once
    });

    it("then refuses automatic extraction, so it can never bury what the patient entered", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.uploadFixture(p.token, "clear-001");
      await kit.correct(p.token, id, { baseVersionNumber: 0, medications: [{ name: "Entered by patient" }] });
      const res = await kit.processRx(p.token, id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
      const versions = await kit.versionsOf(id);
      expect(versions).toHaveLength(1);
      expect(versions[0]?.kind).toBe("patient_correction");
      expect((await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id } })).processingStatus).toBe("pending");
      expect((await kit.get(p.token, `/prescriptions/${id}/latest`)).body.data.verificationStatus).toBe("patient_corrected");
    });

    it("works after a failed extraction, and extraction then stays refused", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.uploadUnrecognised(p.token);
      expect((await kit.processRx(p.token, id)).body.data.processingStatus).toBe("failed");
      expect((await kit.correct(p.token, id, { baseVersionNumber: 0, medications: [{ name: "Entered after failure", dose: "1" }] })).status).toBe(201);
      expect((await kit.processRx(p.token, id)).status).toBe(409);
    });

    it("refuses a correction while extraction is running, but not once the run is stale", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.uploadFixture(p.token, "clear-001");
      await h.pg.query(`UPDATE "PrescriptionRecord" SET "processingStatus" = 'processing' WHERE "id" = $1`, [id]);
      expect((await kit.correct(p.token, id, { baseVersionNumber: 0, prescriberName: "x" })).status).toBe(409);
      await h.pg.query(`UPDATE "PrescriptionRecord" SET "updatedAt" = now() - interval '10 minutes' WHERE "id" = $1`, [id]);
      expect((await kit.correct(p.token, id, { baseVersionNumber: 0, prescriberName: "x" })).status).toBe(201);
    });

    it("releases a slow run's claim when patient data arrives mid-run, leaving exactly the patient's version", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.uploadFixture(p.token, "clear-001");
      const slowApp = buildApp(h.db, testEnv(url), undefined, store, delayed(600));
      const slowRun = kit.processRx(p.token, id, slowApp).then((r) => r);
      await new Promise((resolve) => setTimeout(resolve, 150));
      await h.pg.query(`UPDATE "PrescriptionRecord" SET "updatedAt" = now() - interval '10 minutes' WHERE "id" = $1`, [id]); // run now looks stale
      expect((await kit.correct(p.token, id, { baseVersionNumber: 0, medications: [{ name: "Entered mid-run" }] })).status).toBe(201);
      const slow = await slowRun;
      expect(slow.status).toBe(409);
      const versions = await kit.versionsOf(id);
      expect(versions).toHaveLength(1);
      expect(versions[0]?.kind).toBe("patient_correction");
      // Released, not stuck in "processing".
      expect((await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id } })).processingStatus).toBe("failed");
    });
  });

  describe("validation", () => {
    it("rejects invalid input and creates nothing", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "clear-001");
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const bad: unknown[] = [
        {},
        { baseVersionNumber: 1 },
        { prescriberName: "No base" },
        { baseVersionNumber: "1", prescriberName: "x" },
        { baseVersionNumber: 1, prescriptionDate: tomorrow },
        { baseVersionNumber: 1, prescriptionDate: "2026-02-30" },
        { baseVersionNumber: 1, prescriberName: "line\nbreak" },
        { baseVersionNumber: 1, prescriberName: "x".repeat(201) },
        { baseVersionNumber: 1, medications: [{}] },
        { baseVersionNumber: 1, medications: [{ name: null }] },
        { baseVersionNumber: 1, medications: Array.from({ length: 31 }, () => ({ name: "x" })) },
        { baseVersionNumber: 1, medications: "x" },
        { baseVersionNumber: 1, verificationStatus: "verified_by_authorized_clinician", prescriberName: "x" },
        { baseVersionNumber: 1, patientId: "x", prescriberName: "x" },
        { baseVersionNumber: 1, medications: [{ name: "x", confidence: 1 }] },
        { baseVersionNumber: 1, medications: [{ name: "x", verificationStatus: "verified" }] },
      ];
      for (const body of bad) {
        const res = await kit.correct(p.token, id, body);
        expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
      }
      expect(await kit.versionsOf(id)).toHaveLength(1);
    });

    it("never causes a server error on hostile bodies", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "clear-001");
      const raw = [
        "null", "[]", '"x"', "123", "{bad", "", '{"__proto__":{"baseVersionNumber":1,"prescriberName":"x"}}',
        '{"baseVersionNumber":1,"medications":[{"name":{"$ne":null}}]}', '{"baseVersionNumber":1e999,"prescriberName":"x"}',
        JSON.stringify({ baseVersionNumber: 1, medications: Array.from({ length: 5000 }, () => ({ name: "x" })) }),
        JSON.stringify({ baseVersionNumber: 1, prescriberName: "\u0000".repeat(50) }),
      ];
      for (const body of raw) {
        const res = await request(app).patch(`/api/v1/prescriptions/${id}/extracted-fields`).set("Content-Type", "application/json").set(bearer(p.token)).send(body);
        expect(res.status, body.slice(0, 40)).toBeGreaterThanOrEqual(400);
        expect(res.status, body.slice(0, 40)).toBeLessThan(500);
      }
      expect(await kit.versionsOf(id)).toHaveLength(1);
    });

    it("returns 404 for unknown and malformed ids", async () => {
      const p = await registerPatient(app, h.db);
      for (const bad of ["00000000-0000-4000-8000-000000000000", "not-a-uuid", "%00"]) {
        expect((await kit.correct(p.token, bad, { baseVersionNumber: 0, prescriberName: "x" })).status, bad).toBe(404);
      }
    });
  });

  describe("who may correct", () => {
    async function scene() {
      const owner = await registerPatient(app, h.db);
      const id = await kit.processed(owner.token, "clear-001");
      return { owner, id };
    }

    it("requires authentication", async () => {
      const { id } = await scene();
      expect((await kit.correct(undefined, id, { baseVersionNumber: 1, prescriberName: "x" })).status).toBe(401);
    });

    it("refuses another patient, audits it, and changes nothing", async () => {
      const { owner, id } = await scene();
      const other = await registerPatient(app, h.db);
      const res = await kit.correct(other.token, id, { baseVersionNumber: 1, prescriberName: "Intruder" });
      expect(res.status).toBe(403);
      expect(await kit.versionsOf(id)).toHaveLength(1);
      expect(await h.db.auditEvent.count({ where: { action: "access.denied", actorUserId: other.userId, patientId: owner.patientId, resourceId: id } })).toBe(1);
    });

    it("refuses a provider even with a consent, and an admin", async () => {
      const { owner, id } = await scene();
      const provider = await seedUser(h.db, "provider");
      await h.db.consent.create({ data: { patientId: owner.patientId, granteeUserId: provider.id, resourceScope: "prescriptions:read", purpose: "visit" } });
      expect((await kit.correct(await loginToken(app, provider.email), id, { baseVersionNumber: 1, prescriberName: "x" })).status).toBe(403);
      const admin = await seedUser(h.db, "admin");
      expect((await kit.correct(await loginToken(app, admin.email), id, { baseVersionNumber: 1, prescriberName: "x" })).status).toBe(403);
      expect(await kit.versionsOf(id)).toHaveLength(1);
    });
  });
});
