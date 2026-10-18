import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authorizePatientData } from "../../src/modules/access/patientAccess.js";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, loginToken, registerPatient, seedUser, testEnv } from "./appHelpers.js";

describe.skipIf(!TEST_DATABASE_URL)("patient profile, health card, access history", () => {
  let h: Harness;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    h = await openHarness(TEST_DATABASE_URL as string);
    app = buildApp(h.db, testEnv(TEST_DATABASE_URL as string));
  });
  afterAll(async () => {
    await closeHarness(h);
  });

  const get = (path: string, token?: string) => request(app).get(`/api/v1${path}`).set(token ? bearer(token) : {});
  const patch = (token: string, body: unknown) =>
    request(app).patch("/api/v1/patients/me").set(bearer(token)).send(body as object);

  const PROFILE_KEYS = [
    "address", "allergies", "bloodGroup", "createdAt", "currentMedications", "dateOfBirth", "emergencyContact",
    "existingConditions", "fullName", "gender", "healthId", "id", "phone", "updatedAt",
  ];

  describe("access control", () => {
    it("requires authentication on every endpoint", async () => {
      for (const path of ["/patients/me", "/patients/me/health-card", "/patients/me/access-history"]) {
        expect((await get(path)).status).toBe(401);
      }
      expect((await request(app).patch("/api/v1/patients/me").send({ fullName: "X" })).status).toBe(401);
    });

    it("is patient-only: providers and admins get 403 on every endpoint", async () => {
      const provider = await seedUser(h.db, "provider");
      const admin = await seedUser(h.db, "admin");
      for (const u of [provider, admin]) {
        const token = await loginToken(app, u.email);
        for (const path of ["/patients/me", "/patients/me/health-card", "/patients/me/access-history"]) {
          const res = await get(path, token);
          expect(res.status).toBe(403);
          expect(res.body.error.code).toBe("FORBIDDEN");
        }
        expect((await patch(token, { fullName: "X" })).status).toBe(403);
      }
    });

    it("denies a former patient whose role changed, even though a patient row still exists", async () => {
      for (const role of ["provider", "admin"] as const) {
        const p = await registerPatient(app, h.db);
        expect((await get("/patients/me", p.token)).status).toBe(200);
        await h.db.user.update({ where: { id: p.userId }, data: { role } });
        for (const path of ["/patients/me", "/patients/me/health-card", "/patients/me/access-history"]) {
          expect((await get(path, p.token)).status, `${role} ${path}`).toBe(403);
        }
        expect((await patch(p.token, { fullName: "Should Not Apply" })).status).toBe(403);
        const row = await h.db.patient.findUniqueOrThrow({ where: { id: p.patientId } });
        expect(row.fullName).toBeNull();
      }
    });

    it("denies a patient user that has no patient row", async () => {
      const orphan = await h.db.user.create({ data: { email: `orphan-${process.pid}@example.test`, passwordHash: "x", role: "patient" } });
      const session = await h.db.session.create({ data: { userId: orphan.id, expiresAt: new Date(Date.now() + 60_000) } });
      const { signAccessToken } = await import("../../src/lib/auth/tokens.js");
      const { JWT_SECRET } = await import("./appHelpers.js");
      const token = await signAccessToken(JWT_SECRET, { userId: orphan.id, sessionId: session.id }, new Date(Date.now() + 60_000));
      expect((await get("/patients/me", token)).status).toBe(403);
    });
  });

  describe("GET /patients/me", () => {
    it("returns an empty profile for a new patient with exactly the documented fields", async () => {
      const p = await registerPatient(app, h.db);
      const res = await get("/patients/me", p.token);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(PROFILE_KEYS);
      expect(res.body.data).toMatchObject({
        id: p.patientId,
        fullName: null,
        dateOfBirth: null,
        gender: null,
        bloodGroup: null,
        phone: null,
        emergencyContact: { name: null, relationship: null, phone: null },
        allergies: [],
        existingConditions: [],
        currentMedications: [],
        address: null,
      });
      expect(res.body.data.healthId).toMatch(/^HH-[0-9A-HJKMNP-TV-Z]{8}$/);
      expect(res.body.data.email).toBeTruthy();
      const text = JSON.stringify(res.body);
      for (const leaked of ["passwordHash", "userId", "role", "photoStorageKey", "argon2"]) expect(text).not.toContain(leaked);
    });
  });

  describe("PATCH /patients/me", () => {
    it("updates fields, persists them, and returns the updated profile", async () => {
      const p = await registerPatient(app, h.db);
      const res = await patch(p.token, {
        fullName: "  Asha Synthetic  ",
        dateOfBirth: "1990-04-15",
        gender: "female",
        bloodGroup: "O+",
        phone: "+91 98765 43210",
        emergencyContact: { name: "Ravi Synthetic", phone: "+91 91234 56789" },
        allergies: ["Synthetic-allergen-A", "synthetic-allergen-a", "Synthetic-allergen-B"],
        existingConditions: ["Synthetic condition"],
        currentMedications: ["Synthetic-med 5mg"],
        address: "1 Test Lane, Demo City",
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        fullName: "Asha Synthetic",
        dateOfBirth: "1990-04-15",
        gender: "female",
        bloodGroup: "O+",
        emergencyContact: { name: "Ravi Synthetic", phone: "+91 91234 56789" },
        allergies: ["Synthetic-allergen-A", "Synthetic-allergen-B"],
      });
      const again = await get("/patients/me", p.token);
      expect(again.body.data).toEqual(res.body.data);
    });

    it("merges partial updates and leaves other fields untouched", async () => {
      const p = await registerPatient(app, h.db);
      await patch(p.token, { fullName: "Keep Me", bloodGroup: "A-", emergencyContact: { name: "Contact", phone: "+91 90000 00001" } });
      const res = await patch(p.token, { phone: "+91 90000 00002", emergencyContact: { phone: "+91 90000 00003" } });
      expect(res.body.data).toMatchObject({
        fullName: "Keep Me",
        bloodGroup: "A-",
        phone: "+91 90000 00002",
        emergencyContact: { name: "Contact", phone: "+91 90000 00003" },
      });
    });

    it("clears nullable fields with null and replaces lists wholesale", async () => {
      const p = await registerPatient(app, h.db);
      await patch(p.token, { fullName: "Temp", allergies: ["a", "b", "c"] });
      const res = await patch(p.token, { fullName: null, allergies: ["z"] });
      expect(res.body.data.fullName).toBeNull();
      expect(res.body.data.allergies).toEqual(["z"]);
    });

    it("rejects protected and unknown fields, and changes nothing", async () => {
      const p = await registerPatient(app, h.db);
      const before = (await get("/patients/me", p.token)).body.data;
      const attempts = [
        { healthId: "HH-HACKED00" },
        { id: "00000000-0000-4000-8000-000000000000" },
        { patientId: "00000000-0000-4000-8000-000000000000" },
        { userId: "00000000-0000-4000-8000-000000000000" },
        { role: "admin" },
        { email: "other@example.test" },
        { createdAt: "2000-01-01T00:00:00Z" },
        { photoStorageKey: "x" },
        { fullName: "Ok", healthId: "HH-HACKED00" },
        { emergencyContact: { name: "Ok", unknownField: "x" } },
      ];
      for (const body of attempts) {
        const res = await patch(p.token, body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
      }
      expect((await get("/patients/me", p.token)).body.data).toEqual(before);
    });

    it("rejects invalid values", async () => {
      const p = await registerPatient(app, h.db);
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const bad: unknown[] = [
        {},
        { emergencyContact: {} },
        { fullName: "" },
        { fullName: "   " },
        { fullName: "x".repeat(121) },
        { fullName: "Line\nBreak" },
        { fullName: "Tab\tChar" },
        { fullName: 42 },
        { dateOfBirth: tomorrow },
        { dateOfBirth: "2023-02-31" },
        { dateOfBirth: "1899-12-31" },
        { dateOfBirth: "15/04/1990" },
        { dateOfBirth: "1990-04-15T00:00:00Z" },
        { gender: "unknown-value" },
        { bloodGroup: "C+" },
        { bloodGroup: "o+" },
        { phone: "abc" },
        { phone: "12" },
        { phone: "+91 98765 43210; DROP TABLE" },
        { allergies: "peanuts" },
        { allergies: [""] },
        { allergies: [1] },
        { allergies: ["x".repeat(101)] },
        { allergies: Array.from({ length: 31 }, (_, i) => `a${i}`) },
        { address: "x".repeat(301) },
        { fullName: null, dateOfBirth: "not-a-date" },
      ];
      for (const body of bad) {
        const res = await patch(p.token, body);
        expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      }
    });

    it("keeps the health ID stable across updates", async () => {
      const p = await registerPatient(app, h.db);
      const before = (await get("/patients/me", p.token)).body.data.healthId;
      await patch(p.token, { fullName: "Stable Id" });
      expect((await get("/patients/me", p.token)).body.data.healthId).toBe(before);
    });

    it("edits only the caller's own profile", async () => {
      const a = await registerPatient(app, h.db);
      const b = await registerPatient(app, h.db);
      await patch(a.token, { fullName: "Alice Synthetic" });
      expect((await get("/patients/me", b.token)).body.data.fullName).toBeNull();
      expect((await patch(a.token, { patientId: b.patientId, fullName: "X" })).status).toBe(400);
      expect((await get("/patients/me", b.token)).body.data.fullName).toBeNull();
    });

    it("audits changes with field names only, and skips the audit when nothing changed", async () => {
      const p = await registerPatient(app, h.db);
      await patch(p.token, { fullName: "Audit Person", allergies: ["secret-allergen-xyz"], emergencyContact: { phone: "+91 90000 00009" } });
      const events = await h.db.auditEvent.findMany({ where: { patientId: p.patientId, action: "patient.profile_updated" } });
      expect(events).toHaveLength(1);
      expect((events[0]?.metadata as { changedFields: string[] }).changedFields.sort()).toEqual(
        ["allergies", "emergencyContact.phone", "fullName"].sort(),
      );
      const stored = JSON.stringify(events);
      for (const value of ["Audit Person", "secret-allergen-xyz", "90000 00009"]) expect(stored).not.toContain(value);

      await patch(p.token, { fullName: "Audit Person" }); // identical value
      expect(await h.db.auditEvent.count({ where: { patientId: p.patientId, action: "patient.profile_updated" } })).toBe(1);
    });
  });

  describe("GET /patients/me/health-card", () => {
    it("returns identity fields only, with a clear non-official notice", async () => {
      const p = await registerPatient(app, h.db);
      await patch(p.token, {
        fullName: "Card Holder",
        dateOfBirth: "1985-01-02",
        bloodGroup: "B+",
        phone: "+91 90000 11111",
        address: "Private Street 1",
        allergies: ["private-allergen"],
        existingConditions: ["private-condition"],
        currentMedications: ["private-med"],
        emergencyContact: { name: "Private Contact", phone: "+91 92222 22222" },
      });
      const res = await get("/patients/me/health-card", p.token);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(
        ["bloodGroup", "dateOfBirth", "fullName", "generatedAt", "healthId", "issuer", "notice"],
      );
      expect(res.body.data).toMatchObject({ fullName: "Card Holder", dateOfBirth: "1985-01-02", bloodGroup: "B+", issuer: "HealthHub" });
      expect(res.body.data.notice).toMatch(/not an official national health ID/);
      const text = JSON.stringify(res.body);
      for (const secret of ["private-allergen", "private-condition", "private-med", "Private Street", "Private Contact", "90000 11111"]) {
        expect(text).not.toContain(secret);
      }
    });

    it("shows only the caller's own card", async () => {
      const a = await registerPatient(app, h.db);
      const b = await registerPatient(app, h.db);
      const cardA = (await get("/patients/me/health-card", a.token)).body.data;
      const cardB = (await get("/patients/me/health-card", b.token)).body.data;
      expect(cardA.healthId).not.toBe(cardB.healthId);
    });
  });

  describe("GET /patients/me/access-history", () => {
    const providerCtx = (userId: string) => ({ userId, role: "provider" as const, sessionId: "test-session" });

    async function scenario() {
      const patient = await registerPatient(app, h.db);
      const providerUser = await seedUser(h.db, "provider");
      const providerToken = await loginToken(app, providerUser.email);
      return { patient, provider: { ...providerUser, token: providerToken } };
    }

    it("is empty for a patient with no relevant events (login and registration are not listed)", async () => {
      const p = await registerPatient(app, h.db);
      await loginToken(app, p.email);
      const res = await get("/patients/me/access-history", p.token);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [], page: { limit: 20, nextCursor: null } });
    });

    it("lists consent changes, provider access, denied attempts, and own profile edits, newest first", async () => {
      const { patient, provider } = await scenario();
      const created = await request(app)
        .post("/api/v1/consents")
        .set(bearer(patient.token))
        .send({ granteeUserId: provider.id, resourceScope: "prescriptions:read", purpose: "Private purpose text" });
      await authorizePatientData(h.db, providerCtx(provider.id), patient.patientId, "prescriptions:read", {
        requestId: "r1",
        resourceType: "prescription",
      });
      await authorizePatientData(h.db, providerCtx(provider.id), patient.patientId, "health_history:read", {
        requestId: "r2",
        resourceType: "health_history",
      }).catch(() => undefined);
      await patch(patient.token, { fullName: "History Person" });
      await request(app).delete(`/api/v1/consents/${created.body.data.id}`).set(bearer(patient.token));

      const res = await get("/patients/me/access-history", patient.token);
      expect(res.status).toBe(200);
      expect(res.body.data.map((e: { action: string }) => e.action)).toEqual([
        "consent.revoked",
        "patient.profile_updated",
        "access.denied",
        "access.granted",
        "consent.created",
      ]);
      const times = res.body.data.map((e: { occurredAt: string }) => e.occurredAt);
      expect([...times].sort().reverse()).toEqual(times);

      const byAction = Object.fromEntries(res.body.data.map((e: { action: string }) => [e.action, e]));
      expect(byAction["access.granted"].actor).toEqual({ type: "provider", userId: provider.id });
      expect(byAction["access.granted"].details).toMatchObject({ resourceScope: "prescriptions:read", consentId: created.body.data.id });
      expect(byAction["access.denied"].details).toMatchObject({ resourceScope: "health_history:read", reason: "no_active_consent" });
      expect(byAction["patient.profile_updated"].actor).toEqual({ type: "self" });
      expect(byAction["patient.profile_updated"].details).toEqual({ changedFields: ["fullName"] });

      const text = JSON.stringify(res.body);
      for (const hidden of ["Private purpose text", "History Person", "requestId", "r1", "r2"]) expect(text).not.toContain(hidden);
    });

    it("never reveals the identity of other users who were denied", async () => {
      const a = await registerPatient(app, h.db);
      const intruder = await registerPatient(app, h.db);
      const admin = await seedUser(h.db, "admin");
      await authorizePatientData(h.db, { userId: intruder.userId, role: "patient", sessionId: "s" }, a.patientId, "prescriptions:read", {
        requestId: "r",
        resourceType: "prescription",
      }).catch(() => undefined);
      await authorizePatientData(h.db, { userId: admin.id, role: "admin", sessionId: "s" }, a.patientId, "prescriptions:read", {
        requestId: "r",
        resourceType: "prescription",
      }).catch(() => undefined);

      const res = await get("/patients/me/access-history", a.token);
      expect(res.body.data).toHaveLength(2);
      for (const event of res.body.data) {
        expect(event.actor).toEqual({ type: "other" });
        expect(event.outcome).toBe("denied");
      }
      const text = JSON.stringify(res.body);
      for (const id of [intruder.userId, admin.id, intruder.patientId]) expect(text).not.toContain(id);
    });

    it("shows only events about the caller", async () => {
      const a = await scenario();
      const b = await scenario();
      await h.db.consent.create({
        data: { patientId: b.patient.patientId, granteeUserId: b.provider.id, resourceScope: "prescriptions:read", purpose: "p" },
      });
      await authorizePatientData(h.db, providerCtx(b.provider.id), b.patient.patientId, "prescriptions:read", {
        requestId: "r",
        resourceType: "prescription",
      });
      expect((await get("/patients/me/access-history", a.patient.token)).body.data).toEqual([]);
      expect((await get("/patients/me/access-history", b.patient.token)).body.data).toHaveLength(1);
    });

    it("paginates with a cursor and validates paging input", async () => {
      const { patient, provider } = await scenario();
      await h.db.consent.create({
        data: { patientId: patient.patientId, granteeUserId: provider.id, resourceScope: "prescriptions:read", purpose: "p" },
      });
      for (let i = 0; i < 3; i += 1) {
        await authorizePatientData(h.db, providerCtx(provider.id), patient.patientId, "prescriptions:read", {
          requestId: `r${i}`,
          resourceType: "prescription",
        });
      }
      const first = await get("/patients/me/access-history?limit=2", patient.token);
      expect(first.body.data).toHaveLength(2);
      const second = await get(`/patients/me/access-history?limit=2&cursor=${first.body.page.nextCursor}`, patient.token);
      expect(second.body.data).toHaveLength(1);
      expect(second.body.page.nextCursor).toBeNull();
      const ids = [...first.body.data, ...second.body.data].map((e: { id: string }) => e.id);
      expect(new Set(ids).size).toBe(3);

      for (const q of ["limit=0", "limit=101", "cursor=nope", "x=1"]) {
        expect((await get(`/patients/me/access-history?${q}`, patient.token)).status).toBe(400);
      }
    });
  });
});
