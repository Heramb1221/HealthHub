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

describe.skipIf(!TEST_DATABASE_URL)("QR access sessions", () => {
  let h: Harness;
  let root: string;
  let store: LocalFileStore;
  let app: ReturnType<typeof buildApp>;
  let kit: ReturnType<typeof rxKit>;
  const url = TEST_DATABASE_URL as string;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  beforeAll(async () => {
    h = await openHarness(url);
    root = await mkdtemp(join(tmpdir(), "hh-qr-int-"));
    store = new LocalFileStore(root);
    app = buildApp(h.db, testEnv(url), undefined, store, new MockExtractionProvider());
    kit = rxKit(app, h);
  });
  afterAll(async () => {
    await closeHarness(h);
    await rm(root, { recursive: true, force: true });
  });

  const create = (token: string | undefined, body: unknown, target = app) =>
    request(target).post("/api/v1/qr/access-sessions").set(token ? bearer(token) : {}).send(body as object);
  const read = (token: string | undefined, id: string) => request(app).get(`/api/v1/qr/access-sessions/${id}`).set(token ? bearer(token) : {});
  const revoke = (token: string | undefined, id: string) => request(app).delete(`/api/v1/qr/access-sessions/${id}`).set(token ? bearer(token) : {});

  async function scene() {
    const owner = await registerPatient(app, h.db);
    const rx = await kit.processed(owner.token, "clear-001");
    const providerUser = await seedUser(h.db, "provider");
    const provider = { id: providerUser.id, token: await loginToken(app, providerUser.email) };
    const created = await create(owner.token, { prescriptionId: rx });
    return { owner, rx, provider, session: created.body.data as { id: string; qrPayload: string; expiresAt: string } };
  }
  const grant = (patientId: string, providerId: string, scope = "prescriptions:read") =>
    h.db.consent.create({ data: { patientId, granteeUserId: providerId, resourceScope: scope, purpose: "visit" } });
  const expire = (id: string) =>
    h.pg.query(`UPDATE "QrAccessSession" SET "createdAt" = now() - interval '2 hours', "expiresAt" = now() - interval '1 hour' WHERE "id" = $1`, [id]);

  describe("creating a session", () => {
    it("gives the owner a short-lived session whose QR payload is only a base plus a random id", async () => {
      const owner = await registerPatient(app, h.db);
      const rx = await kit.processed(owner.token, "clear-001");
      const res = await create(owner.token, { prescriptionId: rx });
      expect(res.status).toBe(201);
      const s = res.body.data;
      expect(Object.keys(s).sort()).toEqual(["createdAt", "expiresAt", "id", "prescriptionId", "qrPayload", "revokedAt"]);
      expect(s.id).toMatch(UUID);
      expect(s.prescriptionId).toBe(rx);
      expect(s.revokedAt).toBeNull();
      expect(s.qrPayload).toBe(`healthhub://qr/${s.id}`);

      // expiresAt comes from the app clock and createdAt from the database clock, so allow a little skew.
      const ttl = new Date(s.expiresAt).getTime() - new Date(s.createdAt).getTime();
      expect(Math.abs(ttl - 15 * 60_000)).toBeLessThan(2_000);
      expect(new Date(s.expiresAt).getTime()).toBeGreaterThan(Date.now());

      // The payload carries no medical or account data.
      for (const hidden of ["Examplecillin", "HH-", owner.email, owner.patientId, rx]) expect(s.qrPayload).not.toContain(hidden);
      const row = await h.db.qrAccessSession.findUniqueOrThrow({ where: { id: s.id } });
      expect(row.patientId).toBe(owner.patientId);
      expect(row.createdByUserId).toBe(owner.userId);
    });

    it("creates unpredictable, distinct ids for each session", async () => {
      const owner = await registerPatient(app, h.db);
      const rx = await kit.processed(owner.token, "clear-001");
      const ids = new Set<string>();
      for (let i = 0; i < 8; i += 1) ids.add((await create(owner.token, { prescriptionId: rx })).body.data.id);
      expect(ids.size).toBe(8);
    });

    it("works for a record that has not been processed yet", async () => {
      const owner = await registerPatient(app, h.db);
      const rx = await kit.uploadFixture(owner.token, "clear-001");
      expect((await create(owner.token, { prescriptionId: rx })).status).toBe(201);
    });

    it("audits creation with ids only", async () => {
      const { owner, session, rx } = await scene();
      const events = await kit.auditOf("qr.session_created", session.id);
      expect(events).toHaveLength(1);
      expect(events[0]?.patientId).toBe(owner.patientId);
      expect(events[0]?.metadata).toEqual({ prescriptionId: rx, ttlMinutes: 15 });
    });

    it("honours a configured lifetime", async () => {
      const short = buildApp(h.db, testEnv(url, { QR_SESSION_TTL_MINUTES: "2", QR_LINK_BASE: "https://app.example.com/" }), undefined, store, new MockExtractionProvider());
      const owner = await registerPatient(short, h.db);
      const rx = await rxKit(short, h).processed(owner.token, "clear-001");
      const s = (await create(owner.token, { prescriptionId: rx }, short)).body.data;
      expect(Math.abs(new Date(s.expiresAt).getTime() - new Date(s.createdAt).getTime() - 2 * 60_000)).toBeLessThan(2_000);
      expect(s.qrPayload).toBe(`https://app.example.com/qr/${s.id}`);
    });

    it("validates the body", async () => {
      const owner = await registerPatient(app, h.db);
      const rx = await kit.processed(owner.token, "clear-001");
      const bad: unknown[] = [{}, { prescriptionId: "nope" }, { prescriptionId: 5 }, { prescriptionId: rx, patientId: owner.patientId }, { prescriptionId: rx, expiresAt: "2999-01-01T00:00:00Z" }, { prescriptionId: rx, ttl: 99999 }, []];
      for (const body of bad) expect((await create(owner.token, body)).status, JSON.stringify(body)).toBe(400);
    });

    it("returns 404 for an unknown prescription", async () => {
      const owner = await registerPatient(app, h.db);
      expect((await create(owner.token, { prescriptionId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
    });

    it("refuses another patient's record (audited), providers, admins, and anonymous callers", async () => {
      const { owner, rx, provider } = await scene();
      const other = await registerPatient(app, h.db);
      expect((await create(other.token, { prescriptionId: rx })).status).toBe(403);
      expect(await h.db.auditEvent.count({ where: { action: "access.denied", actorUserId: other.userId, patientId: owner.patientId, resourceId: rx } })).toBe(1);
      await grant(owner.patientId, provider.id);
      expect((await create(provider.token, { prescriptionId: rx })).status).toBe(403);
      const admin = await seedUser(h.db, "admin");
      expect((await create(await loginToken(app, admin.email), { prescriptionId: rx })).status).toBe(403);
      expect((await create(undefined, { prescriptionId: rx })).status).toBe(401);
      expect(await h.db.qrAccessSession.count({ where: { patientId: owner.patientId } })).toBe(1); // only the one from scene()
    });

    it("rate-limits creation", async () => {
      const limited = buildApp(h.db, testEnv(url, { QR_RATE_LIMIT_MAX: "2" }), undefined, store, new MockExtractionProvider());
      const owner = await registerPatient(limited, h.db);
      const rx = await rxKit(limited, h).processed(owner.token, "clear-001");
      const statuses: number[] = [];
      for (let i = 0; i < 3; i += 1) statuses.push((await create(owner.token, { prescriptionId: rx }, limited)).status);
      expect(statuses).toEqual([201, 201, 429]);
    });
  });

  describe("reading through a session", () => {
    it("lets the owner read their own session, getting only the prescription", async () => {
      const { owner, rx, session } = await scene();
      const res = await read(owner.token, session.id);
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(Object.keys(res.body.data).sort()).toEqual(["prescription", "session"]);
      expect(res.body.data.session).toEqual({ id: session.id, expiresAt: session.expiresAt });
      expect(res.body.data.prescription).toMatchObject({ id: rx, verificationStatus: "unverified" });
      expect(res.body.data.prescription.medications).toHaveLength(2);
      const text = JSON.stringify(res.body);
      for (const hidden of ["originalStorageKey", "originalSha256", owner.email, "healthId", "HH-"]) expect(text).not.toContain(hidden);
    });

    it("gives a provider nothing from the session id alone", async () => {
      const { owner, session, provider } = await scene();
      const res = await read(provider.token, session.id);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(JSON.stringify(res.body)).not.toContain("Examplecillin");
      const denied = await h.db.auditEvent.findMany({ where: { action: "access.denied", actorUserId: provider.id, patientId: owner.patientId, resourceId: session.id } });
      expect(denied).toHaveLength(1);
      expect(denied[0]?.resourceType).toBe("qr_session");
    });

    it("gives a provider access only with a live prescriptions:read consent, checked on every read", async () => {
      const { owner, session, provider, rx } = await scene();
      await grant(owner.patientId, provider.id, "profile:read");
      expect((await read(provider.token, session.id)).status).toBe(403); // wrong scope

      const consent = await grant(owner.patientId, provider.id);
      const ok = await read(provider.token, session.id);
      expect(ok.status).toBe(200);
      expect(ok.body.data.prescription.id).toBe(rx);
      expect(await h.db.auditEvent.count({ where: { action: "access.granted", actorUserId: provider.id, resourceId: session.id } })).toBe(1);

      await h.db.consent.update({ where: { id: consent.id }, data: { revokedAt: new Date() } });
      expect((await read(provider.token, session.id)).status).toBe(403); // revoking consent ends access at once
    });

    it("never gives admins or other patients access", async () => {
      const { session } = await scene();
      const other = await registerPatient(app, h.db);
      expect((await read(other.token, session.id)).status).toBe(403);
      const admin = await seedUser(h.db, "admin");
      expect((await read(await loginToken(app, admin.email), session.id)).status).toBe(403);
    });

    it("requires authentication: a QR scan with no login gets nothing", async () => {
      const { session } = await scene();
      expect((await read(undefined, session.id)).status).toBe(401);
    });

    it("does not let a consent for one patient open another patient's session", async () => {
      const a = await scene();
      const b = await scene();
      await grant(a.owner.patientId, a.provider.id);
      expect((await read(a.provider.token, a.session.id)).status).toBe(200);
      expect((await read(a.provider.token, b.session.id)).status).toBe(403);
    });

    it("shows the record as it is now, not as it was when the QR was made", async () => {
      const owner = await registerPatient(app, h.db);
      const rx = await kit.uploadFixture(owner.token, "clear-001");
      const s = (await create(owner.token, { prescriptionId: rx })).body.data;
      expect((await read(owner.token, s.id)).body.data.prescription.medications).toEqual([]);
      await kit.processRx(owner.token, rx);
      expect((await read(owner.token, s.id)).body.data.prescription.medications).toHaveLength(2);
      await kit.correct(owner.token, rx, { baseVersionNumber: 1, prescriberName: "Dr. Latest" });
      const latest = await read(owner.token, s.id);
      expect(latest.body.data.prescription).toMatchObject({ verificationStatus: "patient_corrected", prescriberName: "Dr. Latest" });
    });

    it("only ever points at the one prescription it was made for", async () => {
      const owner = await registerPatient(app, h.db);
      const rxA = await kit.processed(owner.token, "clear-001");
      const rxB = await kit.processed(owner.token, "ambiguous-001");
      const s = (await create(owner.token, { prescriptionId: rxA })).body.data;
      const res = await read(owner.token, s.id);
      expect(res.body.data.prescription.id).toBe(rxA);
      expect(JSON.stringify(res.body)).not.toContain(rxB);
    });
  });

  describe("expiry and revocation", () => {
    it("stops working once it expires, for everyone", async () => {
      const { owner, session, provider } = await scene();
      await grant(owner.patientId, provider.id);
      expect((await read(provider.token, session.id)).status).toBe(200);
      await expire(session.id);
      expect((await read(owner.token, session.id)).status).toBe(404);
      expect((await read(provider.token, session.id)).status).toBe(404);
    });

    it("lets the owner end a session at once, and repeating it changes nothing", async () => {
      const { owner, session, provider } = await scene();
      await grant(owner.patientId, provider.id);
      expect((await read(provider.token, session.id)).status).toBe(200);

      const first = await revoke(owner.token, session.id);
      expect(first.status).toBe(200);
      expect(first.body.data.revokedAt).toEqual(expect.any(String));
      expect((await read(provider.token, session.id)).status).toBe(404);
      expect((await read(owner.token, session.id)).status).toBe(404);

      const second = await revoke(owner.token, session.id);
      expect(second.status).toBe(200);
      expect(second.body.data.revokedAt).toBe(first.body.data.revokedAt);
      expect(await kit.auditOf("qr.session_revoked", session.id)).toHaveLength(1);
    });

    it("revoking one session leaves the patient's other sessions working", async () => {
      const { owner, rx, session } = await scene();
      const second = (await create(owner.token, { prescriptionId: rx })).body.data;
      await revoke(owner.token, session.id);
      expect((await read(owner.token, session.id)).status).toBe(404);
      expect((await read(owner.token, second.id)).status).toBe(200);
    });

    it("refuses revocation by anyone but the owner, and changes nothing", async () => {
      const { owner, session, provider } = await scene();
      const other = await registerPatient(app, h.db);
      await grant(owner.patientId, provider.id);
      expect((await revoke(other.token, session.id)).status).toBe(403);
      expect((await revoke(provider.token, session.id)).status).toBe(403);
      const admin = await seedUser(h.db, "admin");
      expect((await revoke(await loginToken(app, admin.email), session.id)).status).toBe(403);
      expect((await revoke(undefined, session.id)).status).toBe(401);
      expect((await h.db.qrAccessSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).toBeNull();
    });

    it("cannot be un-revoked or extended through any endpoint", async () => {
      const { owner, session } = await scene();
      await revoke(owner.token, session.id);
      for (const method of ["post", "put", "patch"] as const) {
        const res = await request(app)[method](`/api/v1/qr/access-sessions/${session.id}`).set(bearer(owner.token)).send({ revokedAt: null, expiresAt: "2999-01-01T00:00:00Z" });
        expect(res.status, method).toBeGreaterThanOrEqual(400);
      }
      expect((await read(owner.token, session.id)).status).toBe(404);
    });
  });

  describe("unknown ids", () => {
    it("treats unknown, expired, and revoked sessions identically (no way to tell them apart)", async () => {
      const { owner, session, rx } = await scene();
      const expired = (await create(owner.token, { prescriptionId: rx })).body.data;
      await expire(expired.id);
      const revoked = (await create(owner.token, { prescriptionId: rx })).body.data;
      await revoke(owner.token, revoked.id);

      const strip = (body: { error: { code: string; message: string } }) => ({ code: body.error.code, message: body.error.message });
      const unknown = await read(owner.token, "00000000-0000-4000-8000-000000000000");
      for (const id of [expired.id, revoked.id]) {
        const res = await read(owner.token, id);
        expect(res.status).toBe(404);
        expect(strip(res.body)).toEqual(strip(unknown.body));
      }
      expect(unknown.status).toBe(404);
      expect((await read(owner.token, session.id)).status).toBe(200);
    });

    it("returns 404 for malformed ids on every method", async () => {
      const owner = await registerPatient(app, h.db);
      for (const bad of ["not-a-uuid", "%00", "'; DROP TABLE \"QrAccessSession\";--", "../../etc/passwd", "a".repeat(2000)]) {
        expect((await read(owner.token, encodeURIComponent(bad))).status, bad.slice(0, 20)).toBe(404);
        expect((await revoke(owner.token, encodeURIComponent(bad))).status, bad.slice(0, 20)).toBe(404);
      }
    });

    it("never causes a server error on hostile create bodies", async () => {
      const owner = await registerPatient(app, h.db);
      for (const raw of ["null", "[]", '"x"', "{bad", "", '{"__proto__":{"prescriptionId":"x"}}', '{"prescriptionId":{"$ne":null}}']) {
        const res = await request(app).post("/api/v1/qr/access-sessions").set("Content-Type", "application/json").set(bearer(owner.token)).send(raw);
        expect(res.status, raw).toBeGreaterThanOrEqual(400);
        expect(res.status, raw).toBeLessThan(500);
      }
    });
  });
});
