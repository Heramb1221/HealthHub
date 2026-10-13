import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, loginToken, registerPatient, seedUser, testEnv } from "./appHelpers.js";

describe.skipIf(!TEST_DATABASE_URL)("consents", () => {
  let h: Harness;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    h = await openHarness(TEST_DATABASE_URL as string);
    app = buildApp(h.db, testEnv(TEST_DATABASE_URL as string));
  });
  afterAll(async () => {
    await closeHarness(h);
  });

  const create = (token: string, body: unknown) =>
    request(app).post("/api/v1/consents").set(bearer(token)).send(body as object);
  const grant = { resourceScope: "prescriptions:read", purpose: "Follow-up visit" };

  async function actors() {
    const patient = await registerPatient(app, h.db);
    const providerUser = await seedUser(h.db, "provider");
    const providerToken = await loginToken(app, providerUser.email);
    return { patient, provider: { ...providerUser, token: providerToken } };
  }

  describe("create", () => {
    it("lets a patient grant a provider access and audits it without copying the purpose text", async () => {
      const { patient, provider } = await actors();
      const res = await create(patient.token, { granteeUserId: provider.id, ...grant });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        patientId: patient.patientId,
        granteeUserId: provider.id,
        resourceScope: "prescriptions:read",
        purpose: "Follow-up visit",
        expiresAt: null,
        revokedAt: null,
      });
      const audit = await h.db.auditEvent.findFirstOrThrow({ where: { action: "consent.created", resourceId: res.body.data.id } });
      expect(audit.patientId).toBe(patient.patientId);
      expect(JSON.stringify(audit)).not.toContain("Follow-up visit");
    });

    it("takes the patient from the session: a client-supplied patientId is rejected", async () => {
      const { patient, provider } = await actors();
      const other = await registerPatient(app, h.db);
      const res = await create(patient.token, { granteeUserId: provider.id, ...grant, patientId: other.patientId });
      expect(res.status).toBe(400);
      expect(await h.db.consent.count({ where: { patientId: other.patientId } })).toBe(0);
    });

    it("is patient-only: providers and admins cannot create consents", async () => {
      const { patient, provider } = await actors();
      const admin = await seedUser(h.db, "admin");
      const adminToken = await loginToken(app, admin.email);
      for (const token of [provider.token, adminToken]) {
        const res = await create(token, { granteeUserId: provider.id, ...grant });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      }
      expect(await h.db.consent.count({ where: { patientId: patient.patientId } })).toBe(0);
    });

    it("requires an unauthenticated caller to log in first", async () => {
      expect((await request(app).post("/api/v1/consents").send({})).status).toBe(401);
    });

    it("only allows active providers as grantees, and never the patient themselves", async () => {
      const { patient } = await actors();
      const otherPatient = await registerPatient(app, h.db);
      const admin = await seedUser(h.db, "admin");
      const inactive = await seedUser(h.db, "provider", { isActive: false });
      const cases: Array<[string, number]> = [
        [otherPatient.userId, 404],
        [admin.id, 404],
        [inactive.id, 404],
        ["00000000-0000-4000-8000-000000000000", 404],
        [patient.userId, 400],
      ];
      for (const [granteeUserId, status] of cases) {
        expect((await create(patient.token, { granteeUserId, ...grant })).status).toBe(status);
      }
      expect(await h.db.consent.count({ where: { patientId: patient.patientId } })).toBe(0);
    });

    it("validates scope, purpose, and expiry", async () => {
      const { patient, provider } = await actors();
      const bad: unknown[] = [
        { granteeUserId: provider.id, resourceScope: "everything:write", purpose: "x" },
        { granteeUserId: provider.id, resourceScope: "profile:read", purpose: "" },
        { granteeUserId: provider.id, resourceScope: "profile:read", purpose: "x".repeat(201) },
        { granteeUserId: provider.id, resourceScope: "profile:read", purpose: "x", expiresAt: "tomorrow" },
        { granteeUserId: provider.id, resourceScope: "profile:read", purpose: "x", expiresAt: new Date(Date.now() - 60_000).toISOString() },
        { granteeUserId: "not-a-uuid", resourceScope: "profile:read", purpose: "x" },
        {},
      ];
      for (const body of bad) expect((await create(patient.token, body)).status).toBe(400);
      const future = new Date(Date.now() + 86_400_000).toISOString();
      const ok = await create(patient.token, { granteeUserId: provider.id, resourceScope: "profile:read", purpose: "x", expiresAt: future });
      expect(ok.status).toBe(201);
      expect(ok.body.data.expiresAt).toBe(future);
    });
  });

  describe("list", () => {
    it("shows a patient only their own consents", async () => {
      const a = await actors();
      const b = await actors();
      await create(a.patient.token, { granteeUserId: a.provider.id, ...grant });
      await create(b.patient.token, { granteeUserId: b.provider.id, ...grant });
      const res = await request(app).get("/api/v1/consents").set(bearer(a.patient.token));
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].patientId).toBe(a.patient.patientId);
      expect(res.body.page).toEqual({ limit: 20, nextCursor: null });
    });

    it("shows a provider only consents granted to them, and blocks admins", async () => {
      const a = await actors();
      const b = await actors();
      await create(a.patient.token, { granteeUserId: a.provider.id, ...grant });
      await create(b.patient.token, { granteeUserId: b.provider.id, ...grant });
      const res = await request(app).get("/api/v1/consents").set(bearer(a.provider.token));
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].granteeUserId).toBe(a.provider.id);

      const admin = await seedUser(h.db, "admin");
      const adminToken = await loginToken(app, admin.email);
      expect((await request(app).get("/api/v1/consents").set(bearer(adminToken))).status).toBe(403);
    });

    it("paginates with a cursor and rejects bad paging input", async () => {
      const { patient, provider } = await actors();
      const scopes = ["profile:read", "prescriptions:read", "health_history:read"];
      for (const resourceScope of scopes) await create(patient.token, { granteeUserId: provider.id, resourceScope, purpose: "p" });

      const first = await request(app).get("/api/v1/consents?limit=2").set(bearer(patient.token));
      expect(first.body.data).toHaveLength(2);
      expect(first.body.page.nextCursor).toEqual(expect.any(String));
      const second = await request(app).get(`/api/v1/consents?limit=2&cursor=${first.body.page.nextCursor}`).set(bearer(patient.token));
      expect(second.body.data).toHaveLength(1);
      expect(second.body.page.nextCursor).toBeNull();
      const seen = [...first.body.data, ...second.body.data].map((c: { resourceScope: string }) => c.resourceScope).sort();
      expect(seen).toEqual([...scopes].sort());

      for (const q of ["limit=0", "limit=101", "limit=abc", "cursor=not-a-uuid", "other=1"]) {
        expect((await request(app).get(`/api/v1/consents?${q}`).set(bearer(patient.token))).status).toBe(400);
      }
    });
  });

  describe("revoke", () => {
    it("revokes future access, audits it, and is idempotent", async () => {
      const { patient, provider } = await actors();
      const { body } = await create(patient.token, { granteeUserId: provider.id, ...grant });
      const del = await request(app).delete(`/api/v1/consents/${body.data.id}`).set(bearer(patient.token));
      expect(del.status).toBe(200);
      expect(del.body.data.revokedAt).toEqual(expect.any(String));
      expect(await h.db.auditEvent.count({ where: { action: "consent.revoked", resourceId: body.data.id } })).toBe(1);

      const again = await request(app).delete(`/api/v1/consents/${body.data.id}`).set(bearer(patient.token));
      expect(again.status).toBe(200);
      expect(again.body.data.revokedAt).toBe(del.body.data.revokedAt);
      expect(await h.db.auditEvent.count({ where: { action: "consent.revoked", resourceId: body.data.id } })).toBe(1);
    });

    it("hides other patients' consents: not yours looks like not found, and nothing changes", async () => {
      const a = await actors();
      const b = await registerPatient(app, h.db);
      const { body } = await create(a.patient.token, { granteeUserId: a.provider.id, ...grant });
      const res = await request(app).delete(`/api/v1/consents/${body.data.id}`).set(bearer(b.token));
      expect(res.status).toBe(404);
      expect((await h.db.consent.findUniqueOrThrow({ where: { id: body.data.id } })).revokedAt).toBeNull();
    });

    it("revokes duplicate active consents for the same grantee and scope together", async () => {
      const { patient, provider } = await actors();
      const one = await create(patient.token, { granteeUserId: provider.id, ...grant });
      const two = await create(patient.token, { granteeUserId: provider.id, ...grant });
      await request(app).delete(`/api/v1/consents/${one.body.data.id}`).set(bearer(patient.token));
      expect((await h.db.consent.findUniqueOrThrow({ where: { id: two.body.data.id } })).revokedAt).not.toBeNull();
    });

    it("does not touch the same provider's consent for a different scope", async () => {
      const { patient, provider } = await actors();
      const profile = await create(patient.token, { granteeUserId: provider.id, resourceScope: "profile:read", purpose: "p" });
      const rx = await create(patient.token, { granteeUserId: provider.id, ...grant });
      await request(app).delete(`/api/v1/consents/${profile.body.data.id}`).set(bearer(patient.token));
      expect((await h.db.consent.findUniqueOrThrow({ where: { id: rx.body.data.id } })).revokedAt).toBeNull();
    });

    it("is patient-only and validates the id", async () => {
      const { patient, provider } = await actors();
      const { body } = await create(patient.token, { granteeUserId: provider.id, ...grant });
      expect((await request(app).delete(`/api/v1/consents/${body.data.id}`).set(bearer(provider.token))).status).toBe(403);
      expect((await request(app).delete("/api/v1/consents/not-a-uuid").set(bearer(patient.token))).status).toBe(404);
      expect((await request(app).delete(`/api/v1/consents/${body.data.id}`)).status).toBe(401);
    });
  });
});
