import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disposeLocalOcr, LocalOcrExtractionProvider } from "../../src/extraction/localOcrProvider.js";
import { LocalFileStore } from "../../src/storage/localFileStore.js";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, registerPatient, testEnv } from "./appHelpers.js";

const photo = readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "synthetic", "printed-prescription-photo.jpg"));

// The reported workflow, end to end: photograph a paper prescription -> read it -> review/correct -> save,
// and the original must stay viewable and untouched. Real OCR engine, real database, synthetic data only.
describe.skipIf(!TEST_DATABASE_URL)("scan to save", () => {
  let h: Harness;
  let root: string;
  let app: ReturnType<typeof buildApp>;
  const url = TEST_DATABASE_URL as string;

  beforeAll(async () => {
    h = await openHarness(url);
    root = await mkdtemp(join(tmpdir(), "hh-scan-test-"));
    app = buildApp(h.db, testEnv(url), undefined, new LocalFileStore(root), new LocalOcrExtractionProvider());
  });
  afterAll(async () => {
    await disposeLocalOcr();
    await closeHarness(h);
    await rm(root, { recursive: true, force: true });
  });

  async function scan(token: string, filename = "पर्चा.jpg") {
    const up = await request(app).post("/api/v1/prescriptions").set(bearer(token)).attach("file", photo, { filename, contentType: "image/jpeg" });
    expect(up.status).toBe(201);
    const id = up.body.data.id as string;
    const proc = await request(app).post(`/api/v1/prescriptions/${id}/process`).set(bearer(token));
    expect(proc.status).toBe(200);
    return { id, processed: proc.body.data };
  }

  it("reads the doctor correctly, never marks it verified, and creates no schedules or history on its own", async () => {
    const p = await registerPatient(app, h.db);
    const { id, processed } = await scan(p.token);
    expect(processed.processingStatus).toBe("completed");
    expect(processed.prescriberName).toBe("Dr. Anjali Deshmukh");
    expect(processed.verificationStatus).toBe("needs_review");

    const versions = await h.db.prescriptionVersion.findMany({ where: { prescriptionId: id } });
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ kind: "extraction", extractionProvider: "local-ocr" });

    const record = await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id } });
    expect(await h.db.medicationSchedule.count({ where: { patientId: record.patientId } })).toBe(0);
    expect(await h.db.healthHistoryEntry.count({ where: { patientId: record.patientId } })).toBe(0);
  }, 60_000);

  it("serves the original back byte-for-byte, even for a non-Latin file name", async () => {
    const p = await registerPatient(app, h.db);
    const { id } = await scan(p.token, "पर्चा.jpg");
    const res = await request(app).get(`/api/v1/prescriptions/${id}/file`).set(bearer(p.token)).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
    expect(res.headers["content-disposition"]).toContain("filename*=UTF-8''");
    expect(createHash("sha256").update(res.body as Buffer).digest("hex")).toBe(createHash("sha256").update(photo).digest("hex"));
  }, 60_000);

  it("saves a patient correction that survives re-reading, keeps the original extraction, and leaves the file untouched", async () => {
    const p = await registerPatient(app, h.db);
    const { id, processed } = await scan(p.token);
    const first = processed.medications[0];

    const patch = await request(app)
      .patch(`/api/v1/prescriptions/${id}/extracted-fields`)
      .set(bearer(p.token))
      .send({
        baseVersionNumber: 1,
        prescriberName: "Dr. Anjali Deshmukh",
        medications: [{ name: first.name, strength: "500 mg", dose: "1 tablet", frequency: "1-0-1", duration: "5 days", confirmed: true }],
      });
    expect(patch.status).toBe(201); // a correction creates a new version

    const again = await request(app).get(`/api/v1/prescriptions/${id}`).set(bearer(p.token));
    expect(again.body.data.verificationStatus).toBe("patient_corrected");
    expect(again.body.data.medications).toHaveLength(1);
    expect(again.body.data.medications[0]).toMatchObject({ strength: "500 mg", dose: "1 tablet", frequency: "1-0-1" });

    const versions = await h.db.prescriptionVersion.findMany({ where: { prescriptionId: id }, orderBy: { versionNumber: "asc" }, include: { medications: true } });
    expect(versions.map((v) => v.kind)).toEqual(["extraction", "patient_correction"]);
    expect(versions[0]?.medications.length).toBeGreaterThanOrEqual(4); // original reading preserved, not overwritten

    const record = await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id } });
    expect(record.originalSha256).toBe(createHash("sha256").update(photo).digest("hex"));
  }, 60_000);

  it("rejects a correction based on an out-of-date version instead of silently losing data", async () => {
    const p = await registerPatient(app, h.db);
    const { id } = await scan(p.token);
    const body = { prescriberName: "Dr. Anjali Deshmukh" };
    expect((await request(app).patch(`/api/v1/prescriptions/${id}/extracted-fields`).set(bearer(p.token)).send({ baseVersionNumber: 1, ...body })).status).toBe(201);
    const stale = await request(app).patch(`/api/v1/prescriptions/${id}/extracted-fields`).set(bearer(p.token)).send({ baseVersionNumber: 1, prescriberName: "Dr. Someone Else" });
    expect(stale.status).toBe(409);
  }, 60_000);

  it("refuses a correction that omits baseVersionNumber (the bug the website had)", async () => {
    const p = await registerPatient(app, h.db);
    const { id } = await scan(p.token);
    const res = await request(app).patch(`/api/v1/prescriptions/${id}/extracted-fields`).set(bearer(p.token)).send({ prescriberName: "Dr. Anjali Deshmukh" });
    expect(res.status).toBe(400);
  }, 60_000);
});

describe.skipIf(!TEST_DATABASE_URL)("duplicate uploads", () => {
  let h: Harness;
  let root: string;
  let app: ReturnType<typeof buildApp>;
  const url = TEST_DATABASE_URL as string;

  beforeAll(async () => {
    h = await openHarness(url);
    root = await mkdtemp(join(tmpdir(), "hh-dup-test-"));
    app = buildApp(h.db, testEnv(url), undefined, new LocalFileStore(root));
  });
  afterAll(async () => {
    await closeHarness(h);
    await rm(root, { recursive: true, force: true });
  });

  it("treats a quick re-send of the same photo as the same prescription (double-tap / retry)", async () => {
    const p = await registerPatient(app, h.db);
    const send = () => request(app).post("/api/v1/prescriptions").set(bearer(p.token)).attach("file", photo, { filename: "scan.jpg", contentType: "image/jpeg" });
    const [a, b] = [await send(), await send()];
    expect(a.status).toBe(201);
    expect(b.body.data.id).toBe(a.body.data.id);
    const record = await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id: a.body.data.id } });
    expect(await h.db.prescriptionRecord.count({ where: { patientId: record.patientId } })).toBe(1);
  });

  it("still allows a different photo, and a different patient with the same photo", async () => {
    const p1 = await registerPatient(app, h.db);
    const p2 = await registerPatient(app, h.db);
    const other = Buffer.concat([photo.subarray(0, photo.length - 2), Buffer.from([0, 0]), photo.subarray(photo.length - 2)]);
    const up = (token: string, file: Buffer) => request(app).post("/api/v1/prescriptions").set(bearer(token)).attach("file", file, { filename: "s.jpg", contentType: "image/jpeg" });
    const first = await up(p1.token, photo);
    expect((await up(p1.token, other)).body.data.id).not.toBe(first.body.data.id);
    expect((await up(p2.token, photo)).body.data.id).not.toBe(first.body.data.id);
  });
});
