import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, loginToken, registerPatient, seedUser, testEnv } from "./appHelpers.js";

describe.skipIf(!TEST_DATABASE_URL)("health card QR: emergency summary", () => {
  let h: Harness;
  let app: ReturnType<typeof buildApp>;
  const url = TEST_DATABASE_URL as string;
  const get = (healthId: string, token?: string, target = app) =>
    request(target).get(`/api/v1/qr/emergency/${encodeURIComponent(healthId)}`).set(token ? bearer(token) : {});

  beforeAll(async () => {
    h = await openHarness(url);
    app = buildApp(h.db, testEnv(url));
  });
  afterAll(async () => closeHarness(h));

  async function patientWithProfile() {
    const p = await registerPatient(app, h.db);
    await request(app).patch("/api/v1/patients/me").set(bearer(p.token)).send({
      fullName: "Card Holder",
      bloodGroup: "B+",
      allergies: ["penicillin"],
      address: "Private Street 1",
      existingConditions: ["private-condition"],
      emergencyContact: { name: "Ravi Synthetic", relationship: "Brother", phone: "+91 91234 56789" },
    });
    const card = await request(app).get("/api/v1/patients/me/health-card").set(bearer(p.token));
    return { ...p, healthId: card.body.data.healthId as string, card: card.body.data };
  }

  it("is not available to anonymous callers", async () => {
    const owner = await patientWithProfile();
    expect((await get(owner.healthId)).status).toBe(401);
  });

  it("lets the card holder read their own summary, and nothing beyond the emergency fields", async () => {
    const owner = await patientWithProfile();
    const res = await get(owner.healthId, owner.token);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ healthId: owner.healthId, fullName: "Card Holder", bloodGroup: "B+", criticalAllergies: ["penicillin"] });
    expect(res.body.data.emergencyContact).toEqual({ name: "Ravi Synthetic", relationship: "Brother", phone: "+91 91234 56789" });
    const text = JSON.stringify(res.body);
    for (const hidden of ["Private Street", "private-condition", owner.email]) expect(text).not.toContain(hidden);
    expect(res.headers["cache-control"]).toContain("no-store");
  });

  it("does not let another patient read it by knowing the Health ID, and does not reveal that it exists", async () => {
    const owner = await patientWithProfile();
    const other = await registerPatient(app, h.db);
    const real = await get(owner.healthId, other.token);
    const unknown = await get("HH-ZZZZZZZZ", other.token);
    expect(real.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(real.body.error.code).toBe(unknown.body.error.code);
    expect(JSON.stringify(real.body)).not.toContain("Card Holder");
    const denied = await h.db.auditEvent.findFirst({ where: { action: "emergency.profile_viewed", outcome: "denied", actorUserId: other.userId } });
    expect(denied).not.toBeNull();
  });

  it("gives a signed-in provider the emergency summary and records who looked (break-glass access)", async () => {
    const owner = await patientWithProfile();
    const providerUser = await seedUser(h.db, "provider");
    const token = await loginToken(app, providerUser.email);
    const res = await get(owner.healthId, token);
    expect(res.status).toBe(200);
    expect(res.body.data.bloodGroup).toBe("B+");
    const audit = await h.db.auditEvent.findFirst({ where: { action: "emergency.profile_viewed", outcome: "success", actorUserId: providerUser.id } });
    expect(audit?.metadata).toMatchObject({ basis: "emergency_provider_access" });
  });

  it("refuses other roles", async () => {
    const owner = await patientWithProfile();
    const admin = await seedUser(h.db, "admin");
    expect((await get(owner.healthId, await loginToken(app, admin.email))).status).toBe(403);
  });

  it("answers malformed IDs the same as unknown ones", async () => {
    const owner = await patientWithProfile();
    for (const bad of ["", "nope", "HH-1", "HH-<script>", "../etc/passwd", "HH-ABCDEFGHI"]) {
      const res = await get(bad || "x", owner.token);
      expect([404], bad).toContain(res.status);
    }
  });

  it("rate limits repeated lookups by one user", async () => {
    const limited = buildApp(h.db, testEnv(url, { EMERGENCY_RATE_LIMIT_MAX: "3" }));
    const p = await registerPatient(limited, h.db);
    const codes: number[] = [];
    for (let i = 0; i < 5; i += 1) codes.push((await get("HH-ZZZZZZZZ", p.token, limited)).status);
    expect(codes.slice(0, 3)).toEqual([404, 404, 404]);
    expect(codes.slice(3)).toEqual([429, 429]);
  });

  it("builds the card QR from the configured link base (never localhost) and holds only the Health ID", async () => {
    const custom = buildApp(h.db, testEnv(url, { QR_LINK_BASE: "https://sehat.example.org/" }));
    const p = await registerPatient(custom, h.db);
    const card = (await request(custom).get("/api/v1/patients/me/health-card").set(bearer(p.token))).body.data;
    expect(card.qr.url).toBe(`https://sehat.example.org/qr/${card.healthId}`);
    expect(card.qr.url).not.toContain("localhost");
    expect(card.issuer).toBe("Sehat Meds");
    expect(card.notice).toMatch(/not an official national health ID/);
  });
});
