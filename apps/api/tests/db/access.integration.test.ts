import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticate } from "../../src/middleware/authenticate.js";
import { requirePatientAccess } from "../../src/modules/access/patientAccess.js";
import { uuidParam } from "../../src/lib/validate.js";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, loginToken, registerPatient, seedUser, testEnv } from "./appHelpers.js";

describe.skipIf(!TEST_DATABASE_URL)("patient data access guard", () => {
  let h: Harness;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    h = await openHarness(TEST_DATABASE_URL as string);
    const env = testEnv(TEST_DATABASE_URL as string);

    app = buildApp(h.db, env, (router) => {
      router.get(
        "/test/patients/:patientId/data",
        authenticate(h.db, env),
        requirePatientAccess(h.db, {
          scope: "prescriptions:read",
          resourceType: "test_resource",
          getPatientId: async (req) => {
            const patient = await h.db.patient.findUnique({ where: { id: uuidParam(req.params.patientId) }, select: { id: true } });
            return patient?.id ?? null;
          },
        }),
        (req, res) => {
          res.json({ data: { access: req.access } });
        },
      );
    });
  });
  afterAll(async () => {
    await closeHarness(h);
  });

  const read = (token: string | undefined, patientId: string) =>
    request(app)
      .get(`/api/v1/test/patients/${patientId}/data`)
      .set(token ? bearer(token) : {});

  async function setup() {
    const patient = await registerPatient(app, h.db);
    const providerUser = await seedUser(h.db, "provider");
    const provider = { ...providerUser, token: await loginToken(app, providerUser.email) };
    return { patient, provider };
  }

  const auditCount = (action: string, actorUserId: string, patientId: string) =>
    h.db.auditEvent.count({ where: { action, actorUserId, patientId } });

  it("requires authentication", async () => {
    const { patient } = await setup();
    expect((await read(undefined, patient.patientId)).status).toBe(401);
  });

  it("lets a patient read their own data without writing an access event", async () => {
    const { patient } = await setup();
    const res = await read(patient.token, patient.patientId);
    expect(res.status).toBe(200);
    expect(res.body.data.access).toEqual({ kind: "self", patientId: patient.patientId });
    expect(await auditCount("access.granted", patient.userId, patient.patientId)).toBe(0);
  });

  it("denies a patient another patient's data and audits the attempt", async () => {
    const { patient } = await setup();
    const other = await registerPatient(app, h.db);
    const res = await read(patient.token, other.patientId);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await auditCount("access.denied", patient.userId, other.patientId)).toBe(1);
  });

  it("denies a provider with no consent and audits the attempt", async () => {
    const { patient, provider } = await setup();
    const res = await read(provider.token, patient.patientId);
    expect(res.status).toBe(403);
    expect(await auditCount("access.denied", provider.id, patient.patientId)).toBe(1);
  });

  it("allows a provider with an active consent for that scope and audits it", async () => {
    const { patient, provider } = await setup();
    const consent = await h.db.consent.create({
      data: { patientId: patient.patientId, granteeUserId: provider.id, resourceScope: "prescriptions:read", purpose: "visit" },
    });
    const res = await read(provider.token, patient.patientId);
    expect(res.status).toBe(200);
    expect(res.body.data.access).toEqual({ kind: "consent", patientId: patient.patientId, consentId: consent.id });
    expect(await auditCount("access.granted", provider.id, patient.patientId)).toBe(1);
  });

  it("does not let a consent for one scope open another scope", async () => {
    const { patient, provider } = await setup();
    await h.db.consent.create({
      data: { patientId: patient.patientId, granteeUserId: provider.id, resourceScope: "profile:read", purpose: "visit" },
    });
    expect((await read(provider.token, patient.patientId)).status).toBe(403);
  });

  it("does not let a consent for one patient open another patient", async () => {
    const a = await setup();
    const b = await registerPatient(app, h.db);
    await h.db.consent.create({
      data: { patientId: a.patient.patientId, granteeUserId: a.provider.id, resourceScope: "prescriptions:read", purpose: "visit" },
    });
    expect((await read(a.provider.token, a.patient.patientId)).status).toBe(200);
    expect((await read(a.provider.token, b.patientId)).status).toBe(403);
  });

  it("does not let one provider use another provider's consent", async () => {
    const { patient, provider } = await setup();
    const otherUser = await seedUser(h.db, "provider");
    const otherToken = await loginToken(app, otherUser.email);
    await h.db.consent.create({
      data: { patientId: patient.patientId, granteeUserId: provider.id, resourceScope: "prescriptions:read", purpose: "visit" },
    });
    expect((await read(otherToken, patient.patientId)).status).toBe(403);
  });

  it("denies an expired consent", async () => {
    const { patient, provider } = await setup();
    await h.db.consent.create({
      data: {
        patientId: patient.patientId,
        granteeUserId: provider.id,
        resourceScope: "prescriptions:read",
        purpose: "visit",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    expect((await read(provider.token, patient.patientId)).status).toBe(403);
  });

  it("allows a consent that has not expired yet", async () => {
    const { patient, provider } = await setup();
    await h.db.consent.create({
      data: {
        patientId: patient.patientId,
        granteeUserId: provider.id,
        resourceScope: "prescriptions:read",
        purpose: "visit",
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    expect((await read(provider.token, patient.patientId)).status).toBe(200);
  });

  it("denies access immediately after the patient revokes through the API", async () => {
    const { patient, provider } = await setup();
    const created = await request(app)
      .post("/api/v1/consents")
      .set(bearer(patient.token))
      .send({ granteeUserId: provider.id, resourceScope: "prescriptions:read", purpose: "visit" });
    expect((await read(provider.token, patient.patientId)).status).toBe(200);
    await request(app).delete(`/api/v1/consents/${created.body.data.id}`).set(bearer(patient.token));
    expect((await read(provider.token, patient.patientId)).status).toBe(403);
  });

  it("never grants access to admins, even with a consent row naming them", async () => {
    const { patient } = await setup();
    const admin = await seedUser(h.db, "admin");
    const adminToken = await loginToken(app, admin.email);
    await h.db.consent.create({
      data: { patientId: patient.patientId, granteeUserId: admin.id, resourceScope: "prescriptions:read", purpose: "visit" },
    });
    expect((await read(adminToken, patient.patientId)).status).toBe(403);
    expect(await auditCount("access.denied", admin.id, patient.patientId)).toBe(1);
  });

  it("returns NOT_FOUND for unknown or malformed patient ids", async () => {
    const { provider } = await setup();
    const missing = await read(provider.token, "00000000-0000-4000-8000-000000000000");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
    expect((await read(provider.token, "not-a-uuid")).status).toBe(404);
  });
});
