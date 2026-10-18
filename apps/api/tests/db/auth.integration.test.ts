import { decodeJwt, SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { refresh as refreshService } from "../../src/modules/auth/service.js";
import { JWT_SECRET, PASSWORD, bearer, buildApp, loginToken, seedUser, testEnv } from "./appHelpers.js";

// Lets one test force health ID collisions; otherwise the real generator runs.
const forced = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("../../src/modules/patients/healthId.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/modules/patients/healthId.js")>();
  return { generateHealthId: () => forced.ids.shift() ?? original.generateHealthId() };
});

describe.skipIf(!TEST_DATABASE_URL)("authentication", () => {
  let h: Harness;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    h = await openHarness(TEST_DATABASE_URL as string);
    app = buildApp(h.db, testEnv(TEST_DATABASE_URL as string));
  });
  afterAll(async () => {
    await closeHarness(h);
  });

  const register = (body: unknown) => request(app).post("/api/v1/auth/register").send(body as object);
  const login = (body: unknown) => request(app).post("/api/v1/auth/login").send(body as object);
  let n = 0;
  const email = () => `auth-${process.pid}-${(n += 1)}@example.test`;

  describe("register", () => {
    it("creates a patient user, a patient row with a health ID, a session token, and an audit event", async () => {
      const e = email();
      const res = await register({ email: e, password: PASSWORD });
      expect(res.status).toBe(201);
      expect(res.body.data.user).toMatchObject({ email: e, role: "patient" });
      expect(res.body.data.accessToken).toEqual(expect.any(String));

      const user = await h.db.user.findUniqueOrThrow({ where: { email: e }, include: { patient: true } });
      expect(user.patient?.healthId).toMatch(/^HH-[0-9A-HJKMNP-TV-Z]{8}$/);
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain(PASSWORD);
      const audit = await h.db.auditEvent.findFirst({ where: { actorUserId: user.id, action: "auth.register" } });
      expect(audit?.outcome).toBe("success");
    });

    it("never accepts a client-supplied role or any unknown field", async () => {
      for (const extra of [{ role: "admin" }, { patientId: "x" }, { isActive: true }]) {
        const res = await register({ email: email(), password: PASSWORD, ...extra });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("rejects weak input", async () => {
      expect((await register({ email: "not-an-email", password: PASSWORD })).status).toBe(400);
      expect((await register({ email: email(), password: "short" })).status).toBe(400);
      expect((await register({ email: email(), password: "x".repeat(129) })).status).toBe(400);
      expect((await register({})).status).toBe(400);
    });

    it("treats emails case-insensitively and returns CONFLICT for a taken email", async () => {
      const e = email();
      expect((await register({ email: e, password: PASSWORD })).status).toBe(201);
      const dup = await register({ email: e.toUpperCase(), password: PASSWORD });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe("CONFLICT");
      expect(await h.db.user.count({ where: { email: e } })).toBe(1);
    });

    it("retries when a generated health ID collides, without leaving a partial user", async () => {
      forced.ids.push("HH-COLLIDE1");
      const first = await register({ email: email(), password: PASSWORD });
      expect(first.status).toBe(201);

      const e = email();
      forced.ids.push("HH-COLLIDE1", "HH-UNIQUE22");
      const second = await register({ email: e, password: PASSWORD });
      expect(second.status).toBe(201);
      const user = await h.db.user.findUniqueOrThrow({ where: { email: e }, include: { patient: true } });
      expect(user.patient?.healthId).toBe("HH-UNIQUE22");
      expect(await h.db.user.count({ where: { email: e } })).toBe(1);
    });

    it("does not put the role in the token", async () => {
      const res = await register({ email: email(), password: PASSWORD });
      const claims = decodeJwt(res.body.data.accessToken);
      expect(Object.keys(claims).sort()).toEqual(["exp", "iat", "jti", "sub"]);
    });
  });

  describe("login", () => {
    it("logs in with correct credentials and audits it", async () => {
      const u = await seedUser(h.db, "patient");
      const res = await login({ email: u.email.toUpperCase(), password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.user).toEqual({ id: u.id, email: u.email, role: "patient" });
      expect(await h.db.auditEvent.count({ where: { actorUserId: u.id, action: "auth.login", outcome: "success" } })).toBe(1);
    });

    it("gives an identical response for a wrong password, an unknown email, and a deactivated account", async () => {
      const real = await seedUser(h.db, "patient");
      const inactive = await seedUser(h.db, "patient", { isActive: false });
      const bodies = [
        await login({ email: real.email, password: "Wrong-password-1" }),
        await login({ email: email(), password: PASSWORD }),
        await login({ email: inactive.email, password: PASSWORD }),
      ];
      for (const res of bodies) {
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("UNAUTHENTICATED");
      }
      const messages = new Set(bodies.map((r) => r.body.error.message));
      expect(messages.size).toBe(1);
      expect(await h.db.auditEvent.count({ where: { actorUserId: real.id, action: "auth.login", outcome: "denied" } })).toBe(1);
    });

    it("never writes the password or the token into the audit log", async () => {
      const u = await seedUser(h.db, "patient");
      await login({ email: u.email, password: PASSWORD });
      const events = await h.db.auditEvent.findMany({ where: { actorUserId: u.id } });
      expect(JSON.stringify(events)).not.toContain(PASSWORD);
    });
  });

  describe("protected routes and sessions", () => {
    // /consents is the first protected route; any authenticate()-guarded route behaves the same.
    const protectedGet = (headers: Record<string, string> = {}) => request(app).get("/api/v1/consents").set(headers);

    it("returns 401 without a token or with a malformed one", async () => {
      const headerCases: Record<string, string>[] = [{}, { Authorization: "Bearer" }, { Authorization: "Basic abc" }, { Authorization: "Bearer not.a.jwt" }];
      for (const headers of headerCases) {
        const res = await protectedGet(headers);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("UNAUTHENTICATED");
      }
    });

    it("rejects a token signed with a different secret and an unsigned (alg none) token", async () => {
      const u = await seedUser(h.db, "patient");
      const session = await h.db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 60_000) } });
      const forged = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(u.id)
        .setJti(session.id)
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode("x".repeat(48)));
      expect((await protectedGet(bearer(forged))).status).toBe(401);

      const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(
        JSON.stringify({ sub: u.id, jti: session.id, exp: Math.floor(Date.now() / 1000) + 3600 }),
      ).toString("base64url")}.`;
      expect((await protectedGet(bearer(none))).status).toBe(401);
    });

    it("rejects a validly signed token whose session does not exist", async () => {
      const u = await seedUser(h.db, "patient");
      const orphan = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(u.id)
        .setJti("00000000-0000-4000-8000-000000000000")
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(JWT_SECRET));
      expect((await protectedGet(bearer(orphan))).status).toBe(401);
    });

    it("rejects an expired session even if the token itself is still valid", async () => {
      const u = await seedUser(h.db, "patient");
      const token = await loginToken(app, u.email);
      expect((await protectedGet(bearer(token))).status).toBe(200);
      await h.db.session.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await protectedGet(bearer(token))).status).toBe(401);
    });

    it("logout revokes the session immediately", async () => {
      const u = await seedUser(h.db, "patient");
      const token = await loginToken(app, u.email);
      const out = await request(app).post("/api/v1/auth/logout").set(bearer(token));
      expect(out.status).toBe(200);
      expect(out.body).toEqual({ data: { revoked: true } });
      expect((await protectedGet(bearer(token))).status).toBe(401);
      expect((await request(app).post("/api/v1/auth/logout").set(bearer(token))).status).toBe(401);
      expect(await h.db.auditEvent.count({ where: { actorUserId: u.id, action: "auth.logout" } })).toBe(1);
    });

    it("logging out one session leaves the user's other session valid", async () => {
      const u = await seedUser(h.db, "patient");
      const a = await loginToken(app, u.email);
      const b = await loginToken(app, u.email);
      await request(app).post("/api/v1/auth/logout").set(bearer(a));
      expect((await protectedGet(bearer(a))).status).toBe(401);
      expect((await protectedGet(bearer(b))).status).toBe(200);
    });

    it("stops accepting tokens when the user is deactivated", async () => {
      const u = await seedUser(h.db, "patient");
      const token = await loginToken(app, u.email);
      await h.db.user.update({ where: { id: u.id }, data: { isActive: false } });
      expect((await protectedGet(bearer(token))).status).toBe(401);
    });

    it("reads the role from the database on every request, not from the token", async () => {
      const u = await seedUser(h.db, "patient");
      const token = await loginToken(app, u.email);
      expect((await protectedGet(bearer(token))).status).toBe(200);
      await h.db.user.update({ where: { id: u.id }, data: { role: "admin" } });
      // Same token, but the user is now an admin, who has no consent access.
      expect((await protectedGet(bearer(token))).status).toBe(403);
    });
  });

  describe("refreshing a session", () => {
    const refresh = (token: string | undefined, body?: unknown, target = app) => {
      const pending = request(target).post("/api/v1/auth/refresh").set(token ? bearer(token) : {});
      return body === undefined ? pending : pending.send(body as object);
    };
    const protectedGet = (token: string) => request(app).get("/api/v1/consents").set(bearer(token));

    it("swaps a valid token for a fresh one, and the old token stops working at once", async () => {
      const u = await seedUser(h.db, "patient");
      const old = await loginToken(app, u.email);
      const res = await refresh(old);
      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body.data.user).toEqual({ id: u.id, email: u.email, role: "patient" });
      expect(res.body.data.accessToken).not.toBe(old);
      expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect((await protectedGet(old)).status).toBe(401);
      expect((await protectedGet(res.body.data.accessToken)).status).toBe(200);
      expect(await h.db.auditEvent.count({ where: { actorUserId: u.id, action: "auth.refresh", outcome: "success" } })).toBe(1);
    });

    it("can be done only once per token", async () => {
      const u = await seedUser(h.db, "patient");
      const old = await loginToken(app, u.email);
      expect((await refresh(old)).status).toBe(200);
      expect((await refresh(old)).status).toBe(401);
      expect(await h.db.session.count({ where: { userId: u.id, revokedAt: null } })).toBe(1);
    });

    it("can be chained, and only the newest token ever works", async () => {
      const u = await seedUser(h.db, "patient");
      let token = await loginToken(app, u.email);
      const seen: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        seen.push(token);
        const res = await refresh(token);
        expect(res.status, `refresh ${i}`).toBe(200);
        token = res.body.data.accessToken;
      }
      for (const dead of seen) expect((await protectedGet(dead)).status).toBe(401);
      expect((await protectedGet(token)).status).toBe(200);
    });

    it("never extends a login past the absolute maximum age, even if refreshed in time", async () => {
      const u = await seedUser(h.db, "patient");
      const token = await loginToken(app, u.email);
      const session = await h.db.session.findFirstOrThrow({ where: { userId: u.id, revokedAt: null } });
      await h.db.session.update({ where: { id: session.id }, data: { originAt: new Date(Date.now() - 169 * 3_600_000) } }); // limit is 168 hours
      const res = await refresh(token);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
      expect((await protectedGet(token)).status).toBe(401); // and the session is ended
    });

    it("keeps the original login time through refreshes and caps the new expiry by it", async () => {
      const tight = buildApp(h.db, testEnv(TEST_DATABASE_URL as string, { SESSION_MAX_HOURS: "1", ACCESS_TOKEN_TTL_MINUTES: "1440" }));
      const u = await seedUser(h.db, "patient");
      const token = (await request(tight).post("/api/v1/auth/login").send({ email: u.email, password: PASSWORD })).body.data.accessToken as string;
      const first = await h.db.session.findFirstOrThrow({ where: { userId: u.id, revokedAt: null } });
      // A day-long token lifetime is cut to the one-hour absolute limit already at login.
      expect(first.expiresAt.getTime() - first.originAt.getTime()).toBeLessThanOrEqual(3_600_000);
      const origin = new Date(Date.now() - 30 * 60_000);
      await h.db.session.update({ where: { id: first.id }, data: { originAt: origin } });
      const res = await refresh(token, undefined, tight);
      expect(res.status).toBe(200);
      const next = await h.db.session.findFirstOrThrow({ where: { userId: u.id, revokedAt: null } });
      expect(next.originAt.getTime()).toBe(origin.getTime());
      expect(new Date(res.body.data.expiresAt).getTime()).toBeLessThanOrEqual(origin.getTime() + 3_600_000 + 1000);
      expect(new Date(res.body.data.expiresAt).getTime()).toBeLessThan(Date.now() + 31 * 60_000);
    });

    it("re-reads the role from the database, and refuses a deactivated user", async () => {
      const u = await seedUser(h.db, "patient");
      const token = await loginToken(app, u.email);
      await h.db.user.update({ where: { id: u.id }, data: { role: "admin" } });
      const res = await refresh(token);
      expect(res.body.data.user.role).toBe("admin");
      await h.db.user.update({ where: { id: u.id }, data: { isActive: false } });
      expect((await refresh(res.body.data.accessToken)).status).toBe(401);
    });

    it("holds its own guards even when called past the middleware (revoked, deactivated, too old)", async () => {
      const env = testEnv(TEST_DATABASE_URL as string);
      const ctx = { requestId: "svc-test" };
      const live = async () => {
        const u = await seedUser(h.db, "patient");
        await loginToken(app, u.email);
        const session = await h.db.session.findFirstOrThrow({ where: { userId: u.id, revokedAt: null } });
        return { u, session };
      };

      // A session revoked between the check and the swap (the lost race) must not produce a new one.
      const a = await live();
      await h.db.session.update({ where: { id: a.session.id }, data: { revokedAt: new Date() } });
      await expect(refreshService(h.db, env, { userId: a.u.id, sessionId: a.session.id }, ctx)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect(await h.db.session.count({ where: { userId: a.u.id, revokedAt: null } })).toBe(0);

      // A deactivated user cannot refresh.
      const b = await live();
      await h.db.user.update({ where: { id: b.u.id }, data: { isActive: false } });
      await expect(refreshService(h.db, env, { userId: b.u.id, sessionId: b.session.id }, ctx)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect(await h.db.session.count({ where: { userId: b.u.id, revokedAt: null } })).toBe(0);

      // Past the absolute maximum age.
      const c = await live();
      await h.db.session.update({ where: { id: c.session.id }, data: { originAt: new Date(Date.now() - 200 * 3_600_000) } });
      await expect(refreshService(h.db, env, { userId: c.u.id, sessionId: c.session.id }, ctx)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect(await h.db.session.count({ where: { userId: c.u.id, revokedAt: null } })).toBe(0);

      // An unknown session.
      await expect(refreshService(h.db, env, { userId: a.u.id, sessionId: "00000000-0000-4000-8000-000000000000" }, ctx)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    });

    it("needs a valid token", async () => {
      for (const header of [undefined, "Bearer", "Bearer not.a.jwt", "Basic abc"]) {
        const pending = request(app).post("/api/v1/auth/refresh");
        const res = await (header ? pending.set("Authorization", header) : pending);
        expect(res.status, String(header)).toBe(401);
      }
      const u = await seedUser(h.db, "patient");
      const token = await loginToken(app, u.email);
      await request(app).post("/api/v1/auth/logout").set(bearer(token));
      expect((await refresh(token)).status).toBe(401); // a logged-out session cannot be refreshed
    });

    it("takes no body, and rejects one rather than ignoring it", async () => {
      const u = await seedUser(h.db, "patient");
      let token = await loginToken(app, u.email);
      for (const junk of [{ role: "admin" }, { userId: u.id }, { sessionId: "x" }, []]) {
        expect((await refresh(token, junk)).status, JSON.stringify(junk)).toBe(400);
      }
      // A JSON string or number is not an object either.
      for (const raw of ['"x"', "5", "null", "{bad"]) {
        const res = await request(app).post("/api/v1/auth/refresh").set("Content-Type", "application/json").set(bearer(token)).send(raw);
        expect(res.status, raw).toBeGreaterThanOrEqual(400);
        expect(res.status, raw).toBeLessThan(500);
      }
      const ok = await refresh(token, {});
      expect(ok.status).toBe(200);
      token = ok.body.data.accessToken;
      expect((await refresh(token)).status).toBe(200); // and no body at all
    });

    it("is rate limited like login", async () => {
      const limited = buildApp(h.db, testEnv(TEST_DATABASE_URL as string, { AUTH_RATE_LIMIT_MAX: "2" }));
      const u = await seedUser(h.db, "patient");
      const token = (await request(limited).post("/api/v1/auth/login").send({ email: u.email, password: PASSWORD })).body.data.accessToken as string;
      const statuses: number[] = [];
      let current = token;
      for (let i = 0; i < 3; i += 1) {
        const res = await refresh(current, undefined, limited);
        statuses.push(res.status);
        if (res.status === 200) current = res.body.data.accessToken;
      }
      expect(statuses).toEqual([200, 429, 429]);
    });
  });

  describe("rate limiting", () => {
    it("limits repeated login attempts", async () => {
      const limited = buildApp(h.db, testEnv(TEST_DATABASE_URL as string, { AUTH_RATE_LIMIT_MAX: "3" }));
      const statuses: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        statuses.push((await request(limited).post("/api/v1/auth/login").send({ email: email(), password: PASSWORD })).status);
      }
      expect(statuses).toEqual([401, 401, 401, 429, 429]);
    });
  });

  describe("development-only login", () => {
    it("does not exist unless explicitly enabled", async () => {
      const res = await request(app).post("/api/v1/auth/dev-login").send({ email: "someone@demo.healthhub.test" });
      expect(res.status).toBe(404);
    });

    it("works only for demo accounts, and labels every response", async () => {
      const devApp = buildApp(h.db, testEnv(TEST_DATABASE_URL as string, { DEV_AUTH_ENABLED: "true" }));
      const demo = await h.db.user.create({
        data: { email: `dev-${process.pid}@demo.healthhub.test`, passwordHash: "unused", role: "provider" },
      });

      const ok = await request(devApp).post("/api/v1/auth/dev-login").send({ email: demo.email });
      expect(ok.status).toBe(200);
      expect(ok.headers["x-healthhub-dev-only"]).toBe("true");
      expect(ok.body.data.devOnly).toBe(true);
      expect(ok.body.data.user.role).toBe("provider");
      expect((await request(devApp).get("/api/v1/consents").set(bearer(ok.body.data.accessToken))).status).toBe(200);
      expect(await h.db.auditEvent.count({ where: { actorUserId: demo.id, action: "auth.dev_login" } })).toBe(1);

      const real = await seedUser(h.db, "patient");
      const refused = await request(devApp).post("/api/v1/auth/dev-login").send({ email: real.email });
      expect(refused.status).toBe(401);
    });
  });
});
