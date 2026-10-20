import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { LocalFileStore } from "../../src/storage/localFileStore.js";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, loginToken, registerPatient, seedUser, testEnv } from "./appHelpers.js";

const png = (size = 64) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(size, 7)]);
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const webp = () => Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(32, 7)]);
const pdf = () => Buffer.from("%PDF-1.4\n% synthetic test document\n%%EOF\n");

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => relative(dir, join(e.parentPath, e.name)));
}

describe.skipIf(!TEST_DATABASE_URL)("prescription upload and reads", () => {
  let h: Harness;
  let root: string;
  let store: LocalFileStore;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    h = await openHarness(TEST_DATABASE_URL as string);
    root = await mkdtemp(join(tmpdir(), "hh-rx-test-"));
    store = new LocalFileStore(root);
    app = buildApp(h.db, testEnv(TEST_DATABASE_URL as string, { UPLOAD_MAX_BYTES: "2048" }), undefined, store);
  });
  afterAll(async () => {
    await closeHarness(h);
    await rm(root, { recursive: true, force: true });
  });

  const upload = (token: string, file: Buffer, opts: { filename?: string; contentType?: string } = {}) =>
    request(app)
      .post("/api/v1/prescriptions")
      .set(bearer(token))
      .attach("file", file, { filename: opts.filename ?? "synthetic.png", contentType: opts.contentType ?? "image/png" });
  const storedCount = async () => (await filesUnder(root)).length;

  describe("upload", () => {
    it("stores a valid file privately and returns a pending record in the contract shape", async () => {
      const p = await registerPatient(app, h.db);
      const bytes = png();
      const res = await upload(p.token, bytes, { filename: "My Rx.png" });
      expect(res.status).toBe(201);
      expect(Object.keys(res.body.data).sort()).toEqual(
        ["createdAt", "id", "medications", "patientId", "prescriberName", "prescriptionDate", "processingStatus", "sourceType", "updatedAt", "verificationStatus"],
      );
      expect(res.body.data).toMatchObject({
        patientId: p.patientId,
        sourceType: "uploaded_physical",
        processingStatus: "pending",
        verificationStatus: "unverified",
        prescriptionDate: null,
        prescriberName: null,
        medications: [],
      });

      const row = await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id: res.body.data.id } });
      expect(row.originalMimeType).toBe("image/png");
      expect(row.originalSizeBytes).toBe(bytes.length);
      expect(row.originalSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(row.originalFileName).toBe("My Rx.png");
      expect(await store.read(row.originalStorageKey)).toEqual(bytes);
      expect(row.originalStorageKey).toMatch(new RegExp(`^prescriptions/${p.patientId}/[0-9a-f-]{36}$`));

      const text = JSON.stringify(res.body);
      for (const hidden of [row.originalStorageKey, "prescriptions/", "My Rx", row.originalSha256, "url", "http"]) {
        expect(text).not.toContain(hidden);
      }
    });

    it("accepts JPEG, WebP, PDF, and the image/jpg spelling, recording the detected type", async () => {
      const p = await registerPatient(app, h.db);
      const cases: Array<[Buffer, string, string]> = [
        [jpeg(), "image/jpeg", "image/jpeg"],
        [jpeg(), "image/jpg", "image/jpeg"],
        [webp(), "image/webp", "image/webp"],
        [pdf(), "application/pdf", "application/pdf"],
      ];
      for (const [bytes, declared, expected] of cases) {
        const res = await upload(p.token, bytes, { contentType: declared, filename: "f" });
        expect(res.status, declared).toBe(201);
        expect((await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id: res.body.data.id } })).originalMimeType).toBe(expected);
      }
    });

    it("audits the upload with type and size only, never the file name", async () => {
      const p = await registerPatient(app, h.db);
      const res = await upload(p.token, png(), { filename: "secret-name.png" });
      const events = await h.db.auditEvent.findMany({ where: { patientId: p.patientId, action: "prescription.uploaded" } });
      expect(events).toHaveLength(1);
      expect(events[0]?.resourceId).toBe(res.body.data.id);
      expect(events[0]?.metadata).toEqual({ mimeType: "image/png", sizeBytes: png().length });
      expect(JSON.stringify(events)).not.toContain("secret-name");
    });

    it("rejects files whose bytes are not an allowed type, even when labelled as one", async () => {
      const p = await registerPatient(app, h.db);
      const before = await storedCount();
      const rejected: Array<[string, Buffer, string]> = [
        ["executable labelled png", Buffer.from("MZ\x90\x00 fake executable"), "image/png"],
        ["html labelled pdf", Buffer.from("<html><script>alert(1)</script></html>"), "application/pdf"],
        ["svg labelled png", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/png"],
        ["gif", Buffer.from("GIF89a....."), "image/gif"],
        ["pdf bytes labelled png", pdf(), "image/png"],
        ["png bytes labelled pdf", png(), "application/pdf"],
        ["valid png, declared octet-stream", png(), "application/octet-stream"],
        ["valid png, declared text", png(), "text/plain"],
      ];
      for (const [label, bytes, declared] of rejected) {
        const res = await upload(p.token, bytes, { contentType: declared });
        expect(res.status, label).toBe(415);
        expect(res.body.error.code, label).toBe("UNSUPPORTED_MEDIA_TYPE");
      }
      expect(await storedCount()).toBe(before);
      expect(await h.db.prescriptionRecord.count({ where: { patientId: p.patientId } })).toBe(0);
    });

    it("rejects an empty file", async () => {
      const p = await registerPatient(app, h.db);
      const res = await upload(p.token, Buffer.alloc(0));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects oversized files and stores nothing", async () => {
      const p = await registerPatient(app, h.db);
      const before = await storedCount();
      const oneByteOver = await upload(p.token, png(2049 - 8));
      expect(oneByteOver.status).toBe(413);
      const slightlyOver = await upload(p.token, png(3000));
      expect(slightlyOver.status).toBe(413);
      expect(slightlyOver.body.error.code).toBe("PAYLOAD_TOO_LARGE");
      const wayOver = await upload(p.token, png(300_000));
      expect(wayOver.status).toBe(413);
      expect(await storedCount()).toBe(before);
      expect(await h.db.prescriptionRecord.count({ where: { patientId: p.patientId } })).toBe(0);
    });

    it("accepts a file exactly at the limit", async () => {
      const p = await registerPatient(app, h.db);
      const exact = png(2048 - 8);
      expect(exact.length).toBe(2048);
      expect((await upload(p.token, exact)).status).toBe(201);
    });

    it("rejects malformed multipart structure", async () => {
      const p = await registerPatient(app, h.db);
      const post = () => request(app).post("/api/v1/prescriptions").set(bearer(p.token));
      const cases: Array<[string, request.Test, number]> = [
        ["no file part", post().field("sourceType", "uploaded_physical"), 400],
        ["wrong field name", post().attach("document", png(), { filename: "a.png", contentType: "image/png" }), 400],
        ["two files", post().attach("file", png(), { filename: "a.png", contentType: "image/png" }).attach("file", png(), { filename: "b.png", contentType: "image/png" }), 400],
        ["extra field", post().attach("file", png(), { filename: "a.png", contentType: "image/png" }).field("patientId", "x"), 400],
        ["unsupported sourceType", post().attach("file", png(), { filename: "a.png", contentType: "image/png" }).field("sourceType", "clinician_issued"), 400],
        ["json body", post().send({ file: "x" }), 415],
        ["plain text body", post().set("Content-Type", "text/plain").send("hello"), 415],
        ["multipart without boundary", post().set("Content-Type", "multipart/form-data").send("x"), 415],
        ["empty boundary", post().set("Content-Type", "multipart/form-data; boundary=").send("x"), 400],
        ["garbage body", post().set("Content-Type", "multipart/form-data; boundary=xyz").send("not multipart at all"), 400],
        ["truncated body", post().set("Content-Type", "multipart/form-data; boundary=xyz").send('--xyz\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\n\r\nabc'), 400],
      ];
      const before = await storedCount();
      for (const [label, pending, status] of cases) {
        const res = await pending;
        expect(res.status, label).toBe(status);
        expect(res.body.error?.code, label).toEqual(expect.any(String));
      }
      expect(await storedCount()).toBe(before);
    });

    it("accepts sourceType uploaded_physical as the only metadata", async () => {
      const p = await registerPatient(app, h.db);
      const res = await request(app)
        .post("/api/v1/prescriptions")
        .set(bearer(p.token))
        .field("sourceType", "uploaded_physical")
        .attach("file", png(), { filename: "a.png", contentType: "image/png" });
      expect(res.status).toBe(201);
    });

    it("never lets a file name influence where the file is stored", async () => {
      const p = await registerPatient(app, h.db);
      const names = ["../../etc/passwd.png", "..\\..\\windows\\evil.png", "/abs/olute.png", "a\nb.png", "x".repeat(400) + ".png"];
      const created: string[] = [];
      for (const filename of names) {
        const res = await upload(p.token, png(), { filename });
        expect(res.status, filename.slice(0, 20)).toBe(201);
        const row = await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id: res.body.data.id } });
        expect(row.originalFileName).not.toMatch(/[\\/\n]/);
        expect(row.originalFileName.length).toBeLessThanOrEqual(100);
        created.push(row.originalStorageKey);
      }
      const onDisk = (await filesUnder(root)).map((f) => f.split("\\").join("/"));
      for (const key of created) expect(onDisk).toContain(key);
      expect(onDisk.every((f) => /^prescriptions\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(f))).toBe(true);
    });

    it("removes the stored file when saving the record fails", async () => {
      const p = await registerPatient(app, h.db);
      const before = await storedCount();
      const spy = vi.spyOn(h.db, "$transaction").mockRejectedValueOnce(new Error("simulated database failure"));
      const res = await upload(p.token, png());
      spy.mockRestore();
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");
      expect(JSON.stringify(res.body)).not.toContain("simulated");
      expect(await storedCount()).toBe(before);
      expect(await h.db.prescriptionRecord.count({ where: { patientId: p.patientId } })).toBe(0);
    });

    it("enforces the per-patient limit", async () => {
      const limited = buildApp(h.db, testEnv(TEST_DATABASE_URL as string, { PATIENT_PRESCRIPTION_LIMIT: "2" }), undefined, store);
      const p = await registerPatient(limited, h.db);
      const send = () => request(limited).post("/api/v1/prescriptions").set(bearer(p.token)).attach("file", png(), { filename: "a.png", contentType: "image/png" });
      expect((await send()).status).toBe(201);
      expect((await send()).status).toBe(201);
      const before = await storedCount();
      const third = await send();
      expect(third.status).toBe(409);
      expect(third.body.error.code).toBe("CONFLICT");
      expect(await storedCount()).toBe(before);
    });

    it("rate-limits uploads", async () => {
      const limited = buildApp(h.db, testEnv(TEST_DATABASE_URL as string, { UPLOAD_RATE_LIMIT_MAX: "2" }), undefined, store);
      const p = await registerPatient(limited, h.db);
      const send = () => request(limited).post("/api/v1/prescriptions").set(bearer(p.token)).attach("file", png(), { filename: "a.png", contentType: "image/png" });
      expect([(await send()).status, (await send()).status, (await send()).status]).toEqual([201, 201, 429]);
    });

    it("requires a patient: unauthenticated, provider, and admin are refused and nothing is stored", async () => {
      const bare = await request(app).post("/api/v1/prescriptions").attach("file", png(), { filename: "a.png", contentType: "image/png" });
      expect(bare.status).toBe(401);
      for (const role of ["provider", "admin"] as const) {
        const u = await seedUser(h.db, role);
        const token = await loginToken(app, u.email);
        const before = await storedCount();
        expect((await upload(token, png())).status, role).toBe(403);
        expect(await storedCount()).toBe(before);
      }
    });
  });

  describe("list and read", () => {
    async function twoPatientsWithUploads() {
      const a = await registerPatient(app, h.db);
      const b = await registerPatient(app, h.db);
      const rxA = (await upload(a.token, png())).body.data.id as string;
      const rxB = (await upload(b.token, png())).body.data.id as string;
      return { a, b, rxA, rxB };
    }
    const getRx = (token: string | undefined, id: string) =>
      request(app).get(`/api/v1/prescriptions/${id}`).set(token ? bearer(token) : {});

    it("lists only the caller's own prescriptions", async () => {
      const { a, rxA } = await twoPatientsWithUploads();
      const res = await request(app).get("/api/v1/prescriptions").set(bearer(a.token));
      expect(res.status).toBe(200);
      expect(res.body.data.map((r: { id: string }) => r.id)).toEqual([rxA]);
      expect(res.body.page).toEqual({ limit: 20, nextCursor: null });
    });

    it("paginates newest first and validates paging input", async () => {
      const p = await registerPatient(app, h.db);
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) ids.push((await upload(p.token, png())).body.data.id);
      const first = await request(app).get("/api/v1/prescriptions?limit=2").set(bearer(p.token));
      expect(first.body.data.map((r: { id: string }) => r.id)).toEqual([ids[2], ids[1]]);
      const second = await request(app).get(`/api/v1/prescriptions?limit=2&cursor=${first.body.page.nextCursor}`).set(bearer(p.token));
      expect(second.body.data.map((r: { id: string }) => r.id)).toEqual([ids[0]]);
      expect(second.body.page.nextCursor).toBeNull();
      for (const q of ["limit=0", "limit=101", "cursor=nope", "x=1"]) {
        expect((await request(app).get(`/api/v1/prescriptions?${q}`).set(bearer(p.token))).status, q).toBe(400);
      }
    });

    it("blocks providers and admins from the list endpoint", async () => {
      for (const role of ["provider", "admin"] as const) {
        const u = await seedUser(h.db, role);
        expect((await request(app).get("/api/v1/prescriptions").set(bearer(await loginToken(app, u.email)))).status, role).toBe(403);
      }
    });

    it("lets the owner read a prescription", async () => {
      const { a, rxA } = await twoPatientsWithUploads();
      const res = await getRx(a.token, rxA);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(rxA);
      expect(res.body.data.patientId).toBe(a.patientId);
    });

    it("denies another patient, and audits the attempt against the owner", async () => {
      const { a, b, rxA } = await twoPatientsWithUploads();
      const res = await getRx(b.token, rxA);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(await h.db.auditEvent.count({ where: { action: "access.denied", actorUserId: b.userId, patientId: a.patientId, resourceId: rxA } })).toBe(1);
    });

    it("gives providers access only with a live consent for prescriptions:read", async () => {
      const { a, rxA } = await twoPatientsWithUploads();
      const provider = await seedUser(h.db, "provider");
      const token = await loginToken(app, provider.email);

      expect((await getRx(token, rxA)).status).toBe(403);

      await h.db.consent.create({ data: { patientId: a.patientId, granteeUserId: provider.id, resourceScope: "profile:read", purpose: "p" } });
      expect((await getRx(token, rxA)).status).toBe(403);

      const created = await request(app).post("/api/v1/consents").set(bearer(a.token)).send({ granteeUserId: provider.id, resourceScope: "prescriptions:read", purpose: "visit" });
      const allowed = await getRx(token, rxA);
      expect(allowed.status).toBe(200);
      expect(allowed.body.data.id).toBe(rxA);
      expect(await h.db.auditEvent.count({ where: { action: "access.granted", actorUserId: provider.id, resourceId: rxA } })).toBe(1);

      await request(app).delete(`/api/v1/consents/${created.body.data.id}`).set(bearer(a.token));
      expect((await getRx(token, rxA)).status).toBe(403);
    });

    it("does not let a consent on one patient open another patient's prescription", async () => {
      const { a, rxB } = await twoPatientsWithUploads();
      const provider = await seedUser(h.db, "provider");
      await h.db.consent.create({ data: { patientId: a.patientId, granteeUserId: provider.id, resourceScope: "prescriptions:read", purpose: "p" } });
      expect((await getRx(await loginToken(app, provider.email), rxB)).status).toBe(403);
    });

    it("never gives admins access to medical records", async () => {
      const { rxA } = await twoPatientsWithUploads();
      const admin = await seedUser(h.db, "admin");
      expect((await getRx(await loginToken(app, admin.email), rxA)).status).toBe(403);
    });

    it("returns NOT_FOUND for unknown or malformed ids and 401 without a token", async () => {
      const p = await registerPatient(app, h.db);
      expect((await getRx(p.token, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
      expect((await getRx(p.token, "not-a-uuid")).status).toBe(404);
      expect((await getRx(undefined, "00000000-0000-4000-8000-000000000000")).status).toBe(401);
    });

    it("never exposes storage details when reading", async () => {
      const { a, rxA } = await twoPatientsWithUploads();
      const row = await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id: rxA } });
      const text = JSON.stringify([(await getRx(a.token, rxA)).body, (await request(app).get("/api/v1/prescriptions").set(bearer(a.token))).body]);
      for (const hidden of [row.originalStorageKey, row.originalSha256, row.originalFileName, "originalStorageKey", "http"]) {
        expect(text).not.toContain(hidden);
      }
    });
  });
});
