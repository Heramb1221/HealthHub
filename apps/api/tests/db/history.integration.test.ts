import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, loginToken, registerPatient, seedUser, testEnv } from "./appHelpers.js";

describe.skipIf(!TEST_DATABASE_URL)("health history", () => {
  let h: Harness;
  let app: ReturnType<typeof buildApp>;
  const url = TEST_DATABASE_URL as string;

  beforeAll(async () => {
    h = await openHarness(url);
    app = buildApp(h.db, testEnv(url));
  });
  afterAll(async () => closeHarness(h));

  const add = (token: string | undefined, body: unknown) => request(app).post("/api/v1/health-history/conditions").set(token ? bearer(token) : {}).send(body as object);
  const list = (token: string | undefined, q = "") => request(app).get(`/api/v1/health-history${q}`).set(token ? bearer(token) : {});
  async function provider() {
    const u = await seedUser(h.db, "provider");
    return { id: u.id, token: await loginToken(app, u.email) };
  }
  const consent = (patientId: string, granteeUserId: string, scope = "health_history:read") =>
    h.db.consent.create({ data: { patientId, granteeUserId, resourceScope: scope, purpose: "visit" } });

  describe("adding a condition", () => {
    it("stores it labelled patient-reported and unverified, and audits without the content", async () => {
      const p = await registerPatient(app, h.db);
      const res = await add(p.token, { title: "Synthetic Condition A", notes: "Private synthetic note", diagnosedOn: "2024-05-01" });
      expect(res.status).toBe(201);
      expect(Object.keys(res.body.data).sort()).toEqual(["createdAt", "diagnosedOn", "id", "kind", "notes", "source", "title", "verificationStatus"]);
      expect(res.body.data).toMatchObject({ kind: "condition", title: "Synthetic Condition A", diagnosedOn: "2024-05-01", source: "patient_reported", verificationStatus: "unverified" });
      const events = await h.db.auditEvent.findMany({ where: { action: "health_history.condition_added", resourceId: res.body.data.id } });
      expect(events).toHaveLength(1);
      expect(JSON.stringify(events)).not.toMatch(/Synthetic Condition|Private synthetic/);
    });

    it("never accepts a client-chosen source, status, owner, or any unknown field", async () => {
      const p = await registerPatient(app, h.db);
      const other = await registerPatient(app, h.db);
      for (const extra of [{ source: "clinician" }, { verificationStatus: "verified_by_authorized_clinician" }, { patientId: other.patientId }, { kind: "allergy" }, { id: "x" }]) {
        expect((await add(p.token, { title: "X", ...extra })).status, JSON.stringify(extra)).toBe(400);
      }
      expect(await h.db.healthHistoryEntry.count({ where: { patientId: p.patientId } })).toBe(0);
    });

    it("validates the content", async () => {
      const p = await registerPatient(app, h.db);
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const bad: unknown[] = [{}, { title: "" }, { title: "   " }, { title: "x".repeat(121) }, { title: "a\nb" }, { title: "ok", notes: "x".repeat(501) }, { title: "ok", notes: "a\u0000b" },
        { title: "ok", diagnosedOn: tomorrow }, { title: "ok", diagnosedOn: "2024-02-30" }, { title: "ok", diagnosedOn: "1899-12-31" }, { title: "ok", diagnosedOn: "01/05/2024" }, { title: 5 }];
      for (const b of bad) expect((await add(p.token, b)).status, JSON.stringify(b).slice(0, 60)).toBe(400);
      expect((await add(p.token, { title: "Fine", notes: null, diagnosedOn: null })).status).toBe(201);
    });

    it("caps the log, and the log cannot be edited or deleted", async () => {
      const p = await registerPatient(app, h.db);
      await h.db.healthHistoryEntry.createMany({ data: Array.from({ length: 200 }, (_, i) => ({ patientId: p.patientId, title: `Filler ${i}` })) });
      expect((await add(p.token, { title: "One too many" })).status).toBe(409);
      const entry = await h.db.healthHistoryEntry.findFirstOrThrow({ where: { patientId: p.patientId } });
      await expect(h.pg.query(`UPDATE "HealthHistoryEntry" SET "title" = 'changed' WHERE "id" = $1`, [entry.id])).rejects.toMatchObject({ code: "55000" });
      await expect(h.pg.query(`DELETE FROM "HealthHistoryEntry" WHERE "id" = $1`, [entry.id])).rejects.toMatchObject({ code: "55000" });
    });

    it("is patient-only", async () => {
      const prov = await provider();
      const admin = await loginToken(app, (await seedUser(h.db, "admin")).email);
      expect((await add(prov.token, { title: "X" })).status).toBe(403);
      expect((await add(admin, { title: "X" })).status).toBe(403);
      expect((await add(undefined, { title: "X" })).status).toBe(401);
    });
  });

  describe("reading history", () => {
    it("shows a patient only their own entries, newest first, with paging", async () => {
      const a = await registerPatient(app, h.db);
      const b = await registerPatient(app, h.db);
      const ids: string[] = [];
      for (const title of ["First", "Second", "Third"]) ids.push((await add(a.token, { title })).body.data.id);
      await add(b.token, { title: "Not mine" });
      const res = await list(a.token);
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(res.body.data.map((e: { id: string }) => e.id)).toEqual([ids[2], ids[1], ids[0]]);
      const p1 = await list(a.token, "?limit=2");
      const p2 = await list(a.token, `?limit=2&cursor=${p1.body.page.nextCursor}`);
      expect([...p1.body.data, ...p2.body.data].map((e: { id: string }) => e.id)).toEqual([ids[2], ids[1], ids[0]]);
      for (const q of ["?limit=0", "?limit=101", "?cursor=x", "?patientId=x", "?x=1"]) expect((await list(a.token, q)).status, q).toBe(400);
    });

    it("refuses a patient who names someone else (audited)", async () => {
      const a = await registerPatient(app, h.db);
      const b = await registerPatient(app, h.db);
      await add(b.token, { title: "Private" });
      const res = await list(a.token, `?patientId=${b.patientId}`);
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain("Private");
      expect(await h.db.auditEvent.count({ where: { action: "access.denied", actorUserId: a.userId, patientId: b.patientId } })).toBe(1);
      expect((await list(a.token, `?patientId=${a.patientId}`)).status).toBe(200); // naming yourself is fine
    });

    it("gives a provider access only with a live health_history:read consent, and says which patient", async () => {
      const owner = await registerPatient(app, h.db);
      await add(owner.token, { title: "Shared condition" });
      const prov = await provider();
      expect((await list(prov.token)).status).toBe(400); // a provider must name the patient
      expect((await list(prov.token, `?patientId=${owner.patientId}`)).status).toBe(403); // no consent
      await consent(owner.patientId, prov.id, "prescriptions:read");
      expect((await list(prov.token, `?patientId=${owner.patientId}`)).status).toBe(403); // wrong scope
      const c = await consent(owner.patientId, prov.id);
      const ok = await list(prov.token, `?patientId=${owner.patientId}`);
      expect(ok.status).toBe(200);
      expect(ok.body.data[0]).toMatchObject({ title: "Shared condition", source: "patient_reported", verificationStatus: "unverified" });
      const granted = await h.db.auditEvent.findMany({ where: { action: "access.granted", actorUserId: prov.id, patientId: owner.patientId } });
      expect(granted).toHaveLength(1);
      expect(granted[0]?.resourceType).toBe("health_history");
      await h.db.consent.update({ where: { id: c.id }, data: { revokedAt: new Date() } });
      expect((await list(prov.token, `?patientId=${owner.patientId}`)).status).toBe(403);
    });

    it("never lets a consent for one patient open another, or give admins access", async () => {
      const a = await registerPatient(app, h.db);
      const b = await registerPatient(app, h.db);
      await add(b.token, { title: "Other person's" });
      const prov = await provider();
      await consent(a.patientId, prov.id);
      expect((await list(prov.token, `?patientId=${b.patientId}`)).status).toBe(403);
      const admin = await loginToken(app, (await seedUser(h.db, "admin")).email);
      await h.db.consent.create({ data: { patientId: a.patientId, granteeUserId: (await seedUser(h.db, "admin")).id, resourceScope: "health_history:read", purpose: "x" } });
      expect((await list(admin, `?patientId=${a.patientId}`)).status).toBe(403);
      expect((await list(undefined)).status).toBe(401);
    });

    it("never causes a server error on hostile input", async () => {
      const p = await registerPatient(app, h.db);
      for (const raw of ["null", "[]", '"x"', "{bad", "", '{"__proto__":{"title":"x"}}', '{"title":{"$ne":null}}']) {
        const res = await request(app).post("/api/v1/health-history/conditions").set("Content-Type", "application/json").set(bearer(p.token)).send(raw);
        expect(res.status, raw.slice(0, 30)).toBeGreaterThanOrEqual(400);
        expect(res.status, raw.slice(0, 30)).toBeLessThan(500);
      }
      for (const q of ["patientId=%00", "limit=NaN", "cursor[$ne]=x", "patientId=" + "a".repeat(3000)]) expect((await list(p.token, `?${q}`)).status, q.slice(0, 20)).toBeLessThan(500);
    });
  });
});
