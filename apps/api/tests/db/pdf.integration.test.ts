import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockExtractionProvider } from "../../src/extraction/mockProvider.js";
import { sniffMime } from "../../src/modules/prescriptions/fileValidation.js";
import { LocalFileStore } from "../../src/storage/localFileStore.js";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, loginToken, registerPatient, seedUser, testEnv } from "./appHelpers.js";
import { rxKit } from "./rxHelpers.js";

const have = (cmd: string): boolean => spawnSync("which", [cmd]).status === 0;
const HAVE_TOOLS = have("pdftoppm") && have("zbarimg") && have("pdftotext");

const visibleText = (pdf: Buffer): string =>
  [...pdf.toString("latin1").matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => (m[1] ?? "").replace(/\\(.)/g, "$1")).join(" ");

describe.skipIf(!TEST_DATABASE_URL)("prescription PDF download", () => {
  let h: Harness;
  let root: string;
  let store: LocalFileStore;
  let app: ReturnType<typeof buildApp>;
  let kit: ReturnType<typeof rxKit>;
  const url = TEST_DATABASE_URL as string;

  beforeAll(async () => {
    h = await openHarness(url);
    const { mkdtemp: makeDir } = await import("node:fs/promises");
    root = await makeDir(join(tmpdir(), "hh-pdf-int-"));
    store = new LocalFileStore(root);
    app = buildApp(h.db, testEnv(url), undefined, store, new MockExtractionProvider());
    kit = rxKit(app, h);
  });
  afterAll(async () => {
    await closeHarness(h);
    await rm(root, { recursive: true, force: true });
  });

  const download = (token: string | undefined, id: string, target = app) =>
    request(target)
      .get(`/api/v1/prescriptions/${id}/pdf`)
      .set(token ? bearer(token) : {})
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

  it("gives the owner a PDF with the right headers", async () => {
    const p = await registerPatient(app, h.db);
    const id = await kit.processed(p.token, "clear-001");
    const res = await download(p.token, id);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe(`attachment; filename="healthhub-prescription-${id.slice(0, 8)}.pdf"`);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    const body = res.body as Buffer;
    expect(Number(res.headers["content-length"])).toBe(body.length);
    expect(sniffMime(body)).toBe("application/pdf");
  });

  it("names the patient ID, record ID, source, verification status, and QR reference", async () => {
    const p = await registerPatient(app, h.db);
    const id = await kit.processed(p.token, "clear-001");
    const health = (await kit.get(p.token, "/patients/me")).body.data.healthId as string;
    const text = visibleText((await download(p.token, id)).body as Buffer);
    for (const expected of [
      `HealthHub patient ID: ${health}`, `Prescription record ID: ${id}`, "Source: Uploaded physical prescription",
      "Verification status: unverified", "UNVERIFIED", "Examplecillin 250 mg", `healthhub://prescription/${id}`, "not an official national health ID",
    ]) expect(text, expected).toContain(expected);
  });

  it("never exposes storage details, the original file name, or any account data", async () => {
    const p = await registerPatient(app, h.db);
    const id = await kit.processed(p.token, "clear-001");
    const row = await h.db.prescriptionRecord.findUniqueOrThrow({ where: { id } });
    const raw = ((await download(p.token, id)).body as Buffer).toString("latin1");
    for (const hidden of [row.originalStorageKey, row.originalSha256, row.originalFileName, p.email, p.userId, "passwordHash", "prescriptions/"]) {
      expect(raw, hidden).not.toContain(hidden);
    }
  });

  it("reflects the latest version: a needs_review extraction, then a patient correction", async () => {
    const p = await registerPatient(app, h.db);
    const id = await kit.processed(p.token, "ambiguous-001");
    let text = visibleText((await download(p.token, id)).body as Buffer);
    expect(text).toContain("NEEDS REVIEW");
    expect(text).toContain("[NEEDS CHECKING]");

    await kit.correct(p.token, id, { baseVersionNumber: 1, prescriberName: "Dr. Corrected (synthetic)" });
    text = visibleText((await download(p.token, id)).body as Buffer);
    expect(text).toContain("CORRECTED BY PATIENT");
    expect(text).toContain("NOT verification by a doctor or pharmacist");
    expect(text).toContain("Record version: 2 (patient correction)");
    expect(text).toContain("Dr. Corrected (synthetic)");
    expect(text).not.toContain("Reading confidence");
    expect(text).not.toContain("VERIFIED by an authorized clinician");
  });

  it("returns 404 when nothing has been extracted or entered yet", async () => {
    const p = await registerPatient(app, h.db);
    const id = await kit.uploadFixture(p.token, "clear-001");
    const res = await request(app).get(`/api/v1/prescriptions/${id}/pdf`).set(bearer(p.token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("audits each download with the version number only", async () => {
    const p = await registerPatient(app, h.db);
    const id = await kit.processed(p.token, "clear-001");
    await download(p.token, id);
    await download(p.token, id);
    const events = await kit.auditOf("prescription.pdf_downloaded", id);
    expect(events).toHaveLength(2);
    expect(events[0]?.metadata).toEqual({ versionNumber: 1 });
    expect(JSON.stringify(events)).not.toContain("Examplecillin");
  });

  it("uses the configured QR link base", async () => {
    const custom = buildApp(h.db, testEnv(url, { QR_LINK_BASE: "https://app.example.com/r/" }), undefined, store, new MockExtractionProvider());
    const p = await registerPatient(custom, h.db);
    const id = await rxKit(custom, h).processed(p.token, "clear-001");
    const text = visibleText((await download(p.token, id, custom)).body as Buffer);
    expect(text).toContain(`https://app.example.com/r/prescription/${id}`);
  });

  describe("who may download", () => {
    it("requires authentication", async () => {
      const p = await registerPatient(app, h.db);
      const id = await kit.processed(p.token, "clear-001");
      expect((await download(undefined, id)).status).toBe(401);
    });

    it("refuses another patient (audited), providers even with a consent, and admins", async () => {
      const owner = await registerPatient(app, h.db);
      const id = await kit.processed(owner.token, "clear-001");
      const other = await registerPatient(app, h.db);
      expect((await download(other.token, id)).status).toBe(403);
      expect(await h.db.auditEvent.count({ where: { action: "access.denied", actorUserId: other.userId, patientId: owner.patientId, resourceId: id } })).toBe(1);

      const provider = await seedUser(h.db, "provider");
      await h.db.consent.create({ data: { patientId: owner.patientId, granteeUserId: provider.id, resourceScope: "prescriptions:read", purpose: "visit" } });
      expect((await download(await loginToken(app, provider.email), id)).status).toBe(403);
      const admin = await seedUser(h.db, "admin");
      expect((await download(await loginToken(app, admin.email), id)).status).toBe(403);
      expect(await kit.auditOf("prescription.pdf_downloaded", id)).toHaveLength(0);
    });

    it("returns 404 for unknown and malformed ids", async () => {
      const p = await registerPatient(app, h.db);
      for (const bad of ["00000000-0000-4000-8000-000000000000", "not-a-uuid", "%00"]) {
        expect((await download(p.token, bad)).status, bad).toBe(404);
      }
    });
  });

  it.skipIf(!HAVE_TOOLS)("downloads a real file whose QR an independent decoder reads back", async () => {
    const p = await registerPatient(app, h.db);
    const id = await kit.processed(p.token, "clear-001");
    const dir = mkdtempSync(join(tmpdir(), "hh-dl-"));
    try {
      const file = join(dir, "rx.pdf");
      writeFileSync(file, (await download(p.token, id)).body as Buffer);
      spawnSync("pdftoppm", ["-r", "110", "-png", "-f", "1", "-l", "1", file, join(dir, "page")]);
      const decoded = spawnSync("zbarimg", ["-q", "--raw", join(dir, "page-1.png")], { encoding: "utf8" });
      expect(decoded.stdout.trim()).toBe(`healthhub://prescription/${id}`);
      expect(spawnSync("pdftotext", [file, "-"], { encoding: "utf8" }).stdout).toContain(id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
