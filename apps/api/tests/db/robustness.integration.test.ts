import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, loginToken, registerPatient, seedUser, testEnv } from "./appHelpers.js";

// Hostile or malformed input must always produce a 4xx with the contract error
// shape, never a 5xx and never a stack trace or internal detail.
describe.skipIf(!TEST_DATABASE_URL)("hostile input never causes a server error", () => {
  let h: Harness;
  let app: ReturnType<typeof buildApp>;
  let patientToken: string;
  let providerToken: string;
  let providerId: string;

  beforeAll(async () => {
    h = await openHarness(TEST_DATABASE_URL as string);
    app = buildApp(h.db, testEnv(TEST_DATABASE_URL as string, { DEV_AUTH_ENABLED: "true" }));
    patientToken = (await registerPatient(app, h.db)).token;
    const provider = await seedUser(h.db, "provider");
    providerId = provider.id;
    providerToken = await loginToken(app, provider.email);
  });
  afterAll(async () => {
    await closeHarness(h);
  });

  const RAW_BODIES: string[] = [
    "null", "[]", "[1,2,3]", "{}", '"string"', "123", "true", "{bad json", "",
    '{"__proto__":{"role":"admin"}}', '{"constructor":{"prototype":{"x":1}}}',
    '{"email":null,"password":null}', '{"email":[],"password":{}}', '{"email":{"$ne":null},"password":{"$ne":null}}',
    JSON.stringify({ email: "a".repeat(10_000) + "@example.test", password: "p".repeat(10_000) }),
    JSON.stringify({ fullName: "\u0000\u0001", allergies: [null], dateOfBirth: "9999-99-99" }),
    JSON.stringify({ dateOfBirth: 12345, gender: {}, bloodGroup: [], phone: false, emergencyContact: [], address: "1e999" }),
    JSON.stringify({ granteeUserId: 1, resourceScope: [], purpose: {}, expiresAt: 0 }),
    JSON.stringify({ expiresAt: "9999-12-31T23:59:59.999+99:99" }),
    JSON.stringify({ a: { b: { c: { d: { e: { f: {} } } } } } }),
    JSON.stringify({ fullName: "😀".repeat(200), address: "\u202e".repeat(300) }),
  ];

  const ENDPOINTS: Array<{ method: "post" | "patch"; path: string; auth: "patient" | "provider" | "none" }> = [
    { method: "post", path: "/auth/register", auth: "none" },
    { method: "post", path: "/auth/login", auth: "none" },
    { method: "post", path: "/auth/dev-login", auth: "none" },
    { method: "post", path: "/auth/logout", auth: "patient" },
    { method: "post", path: "/consents", auth: "patient" },
    { method: "post", path: "/consents", auth: "provider" },
    { method: "patch", path: "/patients/me", auth: "patient" },
  ];

  it("returns a 4xx contract error for every malformed body on every write endpoint", async () => {
    for (const endpoint of ENDPOINTS) {
      for (const raw of RAW_BODIES) {
        const token = endpoint.auth === "patient" ? patientToken : endpoint.auth === "provider" ? providerToken : undefined;
        // Logout with a valid token would revoke the shared session, so use a throwaway one.
        const useToken = endpoint.path === "/auth/logout" ? "garbage.token.value" : token;
        const url = `/api/v1${endpoint.path}`;
        const pending = endpoint.method === "post" ? request(app).post(url) : request(app).patch(url);
        const res = await pending
          .set("Content-Type", "application/json")
          .set(useToken ? bearer(useToken) : {})
          .send(raw);
        const label = `${endpoint.method.toUpperCase()} ${endpoint.path} (${endpoint.auth}) body=${raw.slice(0, 40)}`;
        expect(res.status, label).toBeGreaterThanOrEqual(400);
        expect(res.status, label).toBeLessThan(500);
        expect(res.body.error?.code, label).toEqual(expect.any(String));
        expect(JSON.stringify(res.body), label).not.toMatch(/stack|prisma|postgres|node_modules|at .*\(.*:\d+:\d+\)/i);
      }
    }
  });

  it("returns a 4xx for hostile query strings and path parameters", async () => {
    const queries = ["limit=NaN", "limit=-1", "limit=1e999", "limit[]=1", "limit=1&limit=2", "cursor=%00", "cursor[$ne]=x", "cursor=" + "a".repeat(5000), "%zz=1"];
    for (const path of ["/consents", "/patients/me/access-history"]) {
      for (const q of queries) {
        const res = await request(app).get(`/api/v1${path}?${q}`).set(bearer(patientToken));
        expect(res.status, `${path}?${q.slice(0, 30)}`).toBeLessThan(500);
      }
    }
    for (const id of ["not-a-uuid", "%00", "'; DROP TABLE \"User\";--", "../../etc/passwd", "a".repeat(5000), "00000000-0000-0000-0000-000000000000"]) {
      const res = await request(app).delete(`/api/v1/consents/${encodeURIComponent(id)}`).set(bearer(patientToken));
      expect(res.status, id.slice(0, 30)).toBeLessThan(500);
    }
  });

  it("does not let a prototype-pollution payload change behaviour", async () => {
    await request(app)
      .patch("/api/v1/patients/me")
      .set("Content-Type", "application/json")
      .set(bearer(patientToken))
      .send('{"__proto__":{"isAdmin":true},"fullName":"Proto Test"}');
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    const consent = await request(app)
      .post("/api/v1/consents")
      .set(bearer(patientToken))
      .send({ granteeUserId: providerId, resourceScope: "profile:read", purpose: "ok" });
    expect(consent.status).toBe(201);
  });
});
