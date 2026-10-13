import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "../../src/extraction/fixtures.js";
import { MockExtractionProvider } from "../../src/extraction/mockProvider.js";
import { buildSyntheticPdf } from "../../src/extraction/syntheticDocuments.js";
import type { ExtractionInput, ExtractionProvider } from "../../src/extraction/types.js";
import { LocalFileStore } from "../../src/storage/localFileStore.js";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, loginToken, registerPatient, seedUser, testEnv } from "./appHelpers.js";

const mock = new MockExtractionProvider();
const delayed = (ms: number): ExtractionProvider => ({
  name: "mock-synthetic",
  extract: async (input: ExtractionInput) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return mock.extract(input);
  },
});
const stub = (extract: ExtractionProvider["extract"]): ExtractionProvider => ({ name: "stub-provider", extract });
const realLooking = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 9)]);

describe.skipIf(!TEST_DATABASE_URL)("prescription processing, versions, latest", () => {
  let h: Harness;
  let root: string;
  let store: LocalFileStore;
  let app: ReturnType<typeof buildApp>;
  let disabledApp: ReturnType<typeof buildApp>;
  const url = TEST_DATABASE_URL as string;

  const appWith = (provider: ExtractionProvider | null, overrides: Record<string, string> = {}) =>
    buildApp(h.db, testEnv(url, overrides), undefined, store, provider);

  beforeAll(async () => {
    h = await openHarness(url);
    root = await mkdtemp(join(tmpdir(), "hh-proc-test-"));
    store = new LocalFileStore(root);
    app = appWith(mock);
    disabledApp = appWith(null);
  });
  afterAll(async () => {
    await closeHarness(h);
    await rm(root, { recursive: true, force: true });
  });

  async function uploadBytes(token: string, bytes: Buffer, contentType: string, filename: string): Promise<string> {
    const res = await request(app).post("/api/v1/prescriptions").set(bearer(token)).attach("file", bytes, { filename, contentType });
    if (res.status !== 201) throw new Error(`upload failed in helper: ${res.status}`);
    return res.body.data.id as string;
  }
  const uploadFixture = (token: string, fixtureId: string) => uploadBytes(token, buildSyntheticPdf(fixtureId), "application/pdf", `${fixtureId}.pdf`);
  const processRx = (token: string | undefined, id: string, target = app) =>
    request(target).post(`/api/v1/prescriptions/${id}/process`).set(token ? bearer(token) : {});
  const getPath = (token: string | undefined, path: string) => request(app).get(`/api/v1${path}`).set(token ? bearer(token) : {});
  const versionsOf = (id: string) => h.db.prescriptionVersion.findMany({ where: { prescriptionId: id }, orderBy: { versionNumber: "asc" } });
  const auditOf = (action: string, resourceId: string) => h.db.auditEvent.findMany({ where: { action, resourceId } });

  describe("processing with the mock provider", () => {
    it("turns a clear synthetic document into a version that is still only unverified", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadFixture(p.token, "clear-001");
      const before = await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id } });

      const res = await processRx(p.token, id);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id,
        processingStatus: "completed",
        verificationStatus: "unverified",
        prescriptionDate: "2026-09-01",
        prescriberName: "Dr. A. Example (synthetic)",
      });
      expect(res.body.data.medications).toHaveLength(2);
      expect(res.body.data.medications[0]).toMatchObject({ name: "Examplecillin", strength: "250 mg", confidence: 0.97 });

      const versions = await versionsOf(id);
      expect(versions).toHaveLength(1);
      expect(versions[0]).toMatchObject({
        versionNumber: 1,
        kind: "extraction",
        verificationStatus: "unverified",
        extractionProvider: "mock-synthetic",
        extractionConfidence: 0.96,
        createdByUserId: null,
        changedFields: [],
      });
      expect(await h.db.prescriptionMedication.count({ where: { versionId: versions[0]?.id } })).toBe(2);

      // The original file and its record fields are untouched.
      const after = await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id } });
      for (const key of ["originalStorageKey", "originalFileName", "originalMimeType", "originalSizeBytes", "originalSha256"] as const) {
        expect(after[key]).toEqual(before[key]);
      }
      expect(await store.read(after.originalStorageKey)).toEqual(buildSyntheticPdf("clear-001"));

      const audit = await auditOf("prescription.processed", id);
      expect(audit).toHaveLength(1);
      expect(audit[0]?.metadata).toEqual({ provider: "mock-synthetic", versionNumber: 1, verificationStatus: "unverified", reviewReasons: [] });
      expect(JSON.stringify(audit)).not.toMatch(/Examplecillin|Testrin|Dr\. A/);
    });

    it("shows the extraction through the record, versions, and latest endpoints", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadFixture(p.token, "clear-001");
      await processRx(p.token, id);

      const record = await getPath(p.token, `/prescriptions/${id}`);
      expect(record.body.data.medications).toHaveLength(2);
      expect(record.body.data.verificationStatus).toBe("unverified");

      const versions = await getPath(p.token, `/prescriptions/${id}/versions`);
      expect(versions.status).toBe(200);
      expect(versions.body.data).toHaveLength(1);
      expect(versions.body.page).toEqual({ limit: 20, nextCursor: null });

      const latest = await getPath(p.token, `/prescriptions/${id}/latest`);
      expect(latest.status).toBe(200);
      expect(Object.keys(latest.body.data).sort()).toEqual(
        ["changedFields", "createdAt", "extractionConfidence", "extractionProvider", "id", "kind", "medications", "prescriberName", "prescriptionDate", "prescriptionId", "verificationStatus", "versionNumber"],
      );
      expect(latest.body.data).toMatchObject({ versionNumber: 1, kind: "extraction", verificationStatus: "unverified", extractionProvider: "mock-synthetic" });
      const text = JSON.stringify([record.body, versions.body, latest.body]);
      for (const hidden of ["originalStorageKey", "originalSha256", "prescriptions/", "createdByUserId"]) expect(text).not.toContain(hidden);
    });

    it("marks an ambiguous document needs_review", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadFixture(p.token, "ambiguous-001");
      const res = await processRx(p.token, id);
      expect(res.body.data.verificationStatus).toBe("needs_review");
      expect(res.body.data.medications).toHaveLength(3);
      const audit = await auditOf("prescription.processed", id);
      expect((audit[0]?.metadata as { reviewReasons: string[] }).reviewReasons).toEqual(
        expect.arrayContaining(["low_confidence", "missing_critical_field", "low_overall_confidence"]),
      );
    });

    it("completes an illegible document with no medications, marked needs_review", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadFixture(p.token, "illegible-001");
      const res = await processRx(p.token, id);
      expect(res.body.data).toMatchObject({ processingStatus: "completed", verificationStatus: "needs_review", medications: [] });
    });

    it("bounds hostile provider output before it is stored", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadFixture(p.token, "adversarial-001");
      const res = await processRx(p.token, id);
      expect(res.status).toBe(200);
      expect(res.body.data.verificationStatus).toBe("needs_review");
      expect(res.body.data.prescriptionDate).toBeNull();
      expect(res.body.data.medications).toHaveLength(30);
      for (const m of res.body.data.medications) {
        expect(m.confidence).toBeGreaterThanOrEqual(0);
        expect(m.confidence).toBeLessThanOrEqual(1);
      }
      expect(res.body.data.medications.slice(0, 3).map((m: { confidence: number }) => m.confidence)).toEqual([0, 0, 0]);
      expect(JSON.stringify(res.body)).not.toMatch(/\\u0000|\\u0007/);
    });

    it("never stores a verified status, whatever a provider claims", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadFixture(p.token, "clear-001");
      const claimsVerified = stub(async () => ({
        ...(FIXTURES["clear-001"]?.raw as object),
        verificationStatus: "verified_by_authorized_clinician",
      }));
      const res = await processRx(p.token, id, appWith(claimsVerified));
      expect(res.body.data.verificationStatus).toBe("unverified");
      expect((await versionsOf(id))[0]?.verificationStatus).toBe("unverified");
    });

    it("never stores a verified status for any fixture", async () => {
      const p = await registerPatient(app, h.db);
      for (const fixtureId of Object.keys(FIXTURES)) {
        const id = await uploadFixture(p.token, fixtureId);
        await processRx(p.token, id);
        for (const v of await versionsOf(id)) expect(["unverified", "needs_review"]).toContain(v.verificationStatus);
      }
    });
  });

  describe("failed runs", () => {
    it("fails, without a version, for a document the mock does not recognise, and can be retried", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadBytes(p.token, realLooking(), "image/png", "real.png");
      const res = await processRx(p.token, id);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ processingStatus: "failed", verificationStatus: "unverified", medications: [] });
      expect(await versionsOf(id)).toHaveLength(0);
      const audit = await auditOf("prescription.processing_failed", id);
      expect(audit[0]?.outcome).toBe("failure");
      expect(audit[0]?.metadata).toEqual({ provider: "mock-synthetic", reason: "unrecognized_input" });
      expect((await getPath(p.token, `/prescriptions/${id}/latest`)).status).toBe(404);

      expect((await processRx(p.token, id)).body.data.processingStatus).toBe("failed"); // retry is allowed
      expect(await versionsOf(id)).toHaveLength(0);
    });

    it("never invents medications for a real-looking file", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadBytes(p.token, Buffer.from("%PDF-1.4 Amoxicillin 500 mg three times daily %%EOF"), "application/pdf", "real.pdf");
      const res = await processRx(p.token, id);
      expect(res.body.data.medications).toEqual([]);
      expect(await h.db.prescriptionMedication.count({ where: { version: { prescriptionId: id } } })).toBe(0);
    });

    it("records a failure when the original file is gone from storage", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadFixture(p.token, "clear-001");
      const row = await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id } });
      await store.delete(row.originalStorageKey);
      const res = await processRx(p.token, id);
      expect(res.body.data.processingStatus).toBe("failed");
      expect((await auditOf("prescription.processing_failed", id))[0]?.metadata).toMatchObject({ reason: "original_file_missing" });
    });

    it("fails safely when the provider throws, without leaking what it said", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadFixture(p.token, "clear-001");
      const throwing = stub(async () => {
        throw new Error("boom: document text Amoxicillin 500 mg");
      });
      const res = await processRx(p.token, id, appWith(throwing));
      expect(res.status).toBe(200);
      expect(res.body.data.processingStatus).toBe("failed");
      expect(JSON.stringify(res.body)).not.toContain("Amoxicillin");
      const audit = await auditOf("prescription.processing_failed", id);
      expect(audit[0]?.metadata).toEqual({ provider: "stub-provider", reason: "provider_error" });
      expect(JSON.stringify(audit)).not.toContain("Amoxicillin");
      expect(await versionsOf(id)).toHaveLength(0);
    });

    it("fails when the provider returns the wrong shape", async () => {
      const p = await registerPatient(app, h.db);
      for (const bad of [null, "text", 5, [], {}, { medications: "x" }]) {
        const id = await uploadFixture(p.token, "clear-001");
        const res = await processRx(p.token, id, appWith(stub(async () => bad)));
        expect(res.body.data.processingStatus, JSON.stringify(bad)).toBe("failed");
        expect((await auditOf("prescription.processing_failed", id))[0]?.metadata).toMatchObject({ reason: "invalid_output" });
        expect(await versionsOf(id)).toHaveLength(0);
      }
    });

    it("leaves no version and a recoverable record when the database fails while saving", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadFixture(p.token, "clear-001");
      const spy = vi.spyOn(h.db, "$transaction").mockRejectedValueOnce(new Error("simulated database failure"));
      const res = await processRx(p.token, id);
      spy.mockRestore();
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain("simulated");
      expect(await versionsOf(id)).toHaveLength(0);
      // Still "processing" and fresh, so an immediate retry is refused...
      expect((await processRx(p.token, id)).status).toBe(409);
      // ...but once the run is stale it can be started again.
      await h.pg.query(`UPDATE "PrescriptionRecord" SET "updatedAt" = now() - interval '10 minutes' WHERE "id" = $1`, [id]);
      const retry = await processRx(p.token, id);
      expect(retry.status).toBe(200);
      expect(retry.body.data.processingStatus).toBe("completed");
      expect(await versionsOf(id)).toHaveLength(1);
    });
  });

  describe("disabled provider", () => {
    it("refuses with PROVIDER_DISABLED, changes nothing, and audits the refusal", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadFixture(p.token, "clear-001");
      const res = await processRx(p.token, id, disabledApp);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("PROVIDER_DISABLED");
      const row = await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id } });
      expect(row.processingStatus).toBe("pending");
      expect(await versionsOf(id)).toHaveLength(0);
      const audit = await auditOf("prescription.process_refused", id);
      expect(audit).toHaveLength(1);
      expect(audit[0]?.outcome).toBe("denied");
    });

    it("is the default when no provider is configured", async () => {
      const unconfigured = buildApp(h.db, testEnv(url), undefined, store);
      const p = await registerPatient(unconfigured, h.db);
      const id = await uploadFixture(p.token, "clear-001");
      expect((await processRx(p.token, id, unconfigured)).status).toBe(503);
    });

    it("still checks access first: a non-owner gets 403, not 503", async () => {
      const owner = await registerPatient(app, h.db);
      const other = await registerPatient(app, h.db);
      const id = await uploadFixture(owner.token, "clear-001");
      expect((await processRx(other.token, id, disabledApp)).status).toBe(403);
    });
  });

  describe("state rules and concurrency", () => {
    it("does not silently re-process a completed record", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadFixture(p.token, "clear-001");
      expect((await processRx(p.token, id)).status).toBe(200);
      const second = await processRx(p.token, id);
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe("CONFLICT");
      expect(await versionsOf(id)).toHaveLength(1);
    });

    it("lets exactly one of many simultaneous calls run", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadFixture(p.token, "clear-001");
      const slow = appWith(delayed(300));
      const results = await Promise.all(Array.from({ length: 6 }, () => processRx(p.token, id, slow)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(5);
      expect(await versionsOf(id)).toHaveLength(1);
      expect(await auditOf("prescription.processed", id)).toHaveLength(1);
    });

    it("refuses a fresh in-progress run but reclaims a stale one", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadFixture(p.token, "clear-001");
      await h.pg.query(`UPDATE "PrescriptionRecord" SET "processingStatus" = 'processing' WHERE "id" = $1`, [id]);
      expect((await processRx(p.token, id)).status).toBe(409);
      await h.pg.query(`UPDATE "PrescriptionRecord" SET "processingStatus" = 'processing', "updatedAt" = now() - interval '10 minutes' WHERE "id" = $1`, [id]);
      const res = await processRx(p.token, id);
      expect(res.status).toBe(200);
      expect(res.body.data.processingStatus).toBe("completed");
    });

    it("abandons a slow run whose claim was taken over, leaving exactly one version", async () => {
      const p = await registerPatient(app, h.db);
      const id = await uploadFixture(p.token, "clear-001");
      const slowRun = processRx(p.token, id, appWith(delayed(600))).then((r) => r);
      await new Promise((resolve) => setTimeout(resolve, 150));
      await h.pg.query(`UPDATE "PrescriptionRecord" SET "updatedAt" = now() - interval '10 minutes' WHERE "id" = $1`, [id]);
      const takeover = await processRx(p.token, id);
      expect(takeover.status).toBe(200);
      const slow = await slowRun;
      expect(slow.status).toBe(409);
      expect(await versionsOf(id)).toHaveLength(1);
      expect((await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id } })).processingStatus).toBe("completed");
    });

    it("rate-limits processing", async () => {
      const limited = appWith(mock, { PROCESS_RATE_LIMIT_MAX: "2" });
      const p = await registerPatient(limited, h.db);
      const id = await uploadFixture(p.token, "illegible-001");
      const statuses: number[] = [];
      for (let i = 0; i < 3; i += 1) statuses.push((await processRx(p.token, id, limited)).status);
      expect(statuses).toEqual([200, 409, 429]);
    });
  });

  describe("who may do what", () => {
    async function scene() {
      const owner = await registerPatient(app, h.db);
      const id = await uploadFixture(owner.token, "clear-001");
      const providerUser = await seedUser(h.db, "provider");
      const provider = { id: providerUser.id, token: await loginToken(app, providerUser.email) };
      return { owner, id, provider };
    }
    const grant = (patientId: string, providerId: string, scope = "prescriptions:read") =>
      h.db.consent.create({ data: { patientId, granteeUserId: providerId, resourceScope: scope, purpose: "visit" } });

    it("requires authentication on all three endpoints", async () => {
      const { id } = await scene();
      expect((await processRx(undefined, id)).status).toBe(401);
      expect((await getPath(undefined, `/prescriptions/${id}/versions`)).status).toBe(401);
      expect((await getPath(undefined, `/prescriptions/${id}/latest`)).status).toBe(401);
    });

    it("keeps another patient out of all three, audits them, and changes nothing", async () => {
      const { owner, id } = await scene();
      const other = await registerPatient(app, h.db);
      expect((await processRx(other.token, id)).status).toBe(403);
      expect((await getPath(other.token, `/prescriptions/${id}/versions`)).status).toBe(403);
      expect((await getPath(other.token, `/prescriptions/${id}/latest`)).status).toBe(403);
      expect(await h.db.auditEvent.count({ where: { action: "access.denied", actorUserId: other.userId, patientId: owner.patientId, resourceId: id } })).toBe(3);
      const row = await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id } });
      expect(row.processingStatus).toBe("pending");
      expect(await versionsOf(id)).toHaveLength(0);
    });

    it("lets a consented provider read the latest version, labelled with its status, and nothing else", async () => {
      const { owner, id, provider } = await scene();
      await processRx(owner.token, id);
      await grant(owner.patientId, provider.id);

      const latest = await getPath(provider.token, `/prescriptions/${id}/latest`);
      expect(latest.status).toBe(200);
      expect(latest.body.data.verificationStatus).toBe("unverified");
      expect(latest.body.data.medications).toHaveLength(2);
      expect(await h.db.auditEvent.count({ where: { action: "access.granted", actorUserId: provider.id, resourceId: id } })).toBe(1);

      expect((await getPath(provider.token, `/prescriptions/${id}/versions`)).status).toBe(403); // history is owner-only
      expect((await processRx(provider.token, id)).status).toBe(403); // a consent never grants processing
    });

    it("never lets a provider process, even with consent, and leaves the record untouched", async () => {
      const { owner, id, provider } = await scene();
      await grant(owner.patientId, provider.id);
      expect((await processRx(provider.token, id)).status).toBe(403);
      expect((await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id } })).processingStatus).toBe("pending");
      expect(await versionsOf(id)).toHaveLength(0);
    });

    it("denies a provider without a live consent for this scope", async () => {
      const { owner, id, provider } = await scene();
      await processRx(owner.token, id);
      expect((await getPath(provider.token, `/prescriptions/${id}/latest`)).status).toBe(403); // none
      const wrongScope = await grant(owner.patientId, provider.id, "profile:read");
      expect((await getPath(provider.token, `/prescriptions/${id}/latest`)).status).toBe(403);
      await h.db.consent.delete({ where: { id: wrongScope.id } }).catch(() => undefined);
      const right = await grant(owner.patientId, provider.id);
      expect((await getPath(provider.token, `/prescriptions/${id}/latest`)).status).toBe(200);
      await h.db.consent.update({ where: { id: right.id }, data: { revokedAt: new Date() } });
      expect((await getPath(provider.token, `/prescriptions/${id}/latest`)).status).toBe(403);
    });

    it("never gives admins access to any of them", async () => {
      const { id } = await scene();
      const admin = await seedUser(h.db, "admin");
      const token = await loginToken(app, admin.email);
      expect((await processRx(token, id)).status).toBe(403);
      expect((await getPath(token, `/prescriptions/${id}/versions`)).status).toBe(403);
      expect((await getPath(token, `/prescriptions/${id}/latest`)).status).toBe(403);
    });

    it("returns 404 before processing for latest, and for unknown or malformed ids everywhere", async () => {
      const { owner, id } = await scene();
      expect((await getPath(owner.token, `/prescriptions/${id}/latest`)).status).toBe(404);
      for (const bad of ["00000000-0000-4000-8000-000000000000", "not-a-uuid", "%00", "..%2F..%2Fetc"]) {
        expect((await processRx(owner.token, bad)).status, `process ${bad}`).toBe(404);
        expect((await getPath(owner.token, `/prescriptions/${bad}/versions`)).status, `versions ${bad}`).toBe(404);
        expect((await getPath(owner.token, `/prescriptions/${bad}/latest`)).status, `latest ${bad}`).toBe(404);
      }
    });

    it("pages through history newest first, and latest is always the highest version", async () => {
      const { owner, id } = await scene();
      await processRx(owner.token, id);
      // Later versions (for example patient corrections, added in the next milestone) go on top.
      for (const n of [2, 3]) {
        await h.db.prescriptionVersion.create({
          data: { prescriptionId: id, versionNumber: n, kind: "patient_correction", verificationStatus: "patient_corrected", createdByUserId: owner.userId, changedFields: ["medications"] },
        });
      }
      const first = await getPath(owner.token, `/prescriptions/${id}/versions?limit=2`);
      expect(first.body.data.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([3, 2]);
      const second = await getPath(owner.token, `/prescriptions/${id}/versions?limit=2&cursor=${first.body.page.nextCursor}`);
      expect(second.body.data.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([1]);
      expect(second.body.page.nextCursor).toBeNull();

      const latest = await getPath(owner.token, `/prescriptions/${id}/latest`);
      expect(latest.body.data).toMatchObject({ versionNumber: 3, kind: "patient_correction", verificationStatus: "patient_corrected" });
      expect((await getPath(owner.token, `/prescriptions/${id}`)).body.data.verificationStatus).toBe("patient_corrected");

      for (const q of ["limit=0", "limit=101", "cursor=nope", "x=1"]) {
        expect((await getPath(owner.token, `/prescriptions/${id}/versions?${q}`)).status, q).toBe(400);
      }
    });
  });
});
