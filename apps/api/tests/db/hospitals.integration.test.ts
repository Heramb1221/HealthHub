import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalFileStore } from "../../src/storage/localFileStore.js";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, loginToken, registerPatient, seedUser, testEnv } from "./appHelpers.js";

const HOUR = 3_600_000;
const HOSPITAL_KEYS = ["address", "city", "createdAt", "id", "isActive", "isDemo", "locationUrl", "name", "phone", "specialties", "timings", "updatedAt", "website"];

describe.skipIf(!TEST_DATABASE_URL)("hospital directory and availability", () => {
  let h: Harness;
  let app: ReturnType<typeof buildApp>;
  let admin: string;
  let patient: Awaited<ReturnType<typeof registerPatient>>;
  let provider: string;
  let root: string;
  const url = TEST_DATABASE_URL as string;
  let n = 0;
  const uniq = (p: string) => `${p} ${process.pid}-${(n += 1)}`;

  beforeAll(async () => {
    h = await openHarness(url);
    root = await mkdtemp(join(tmpdir(), "hh-hosp-test-"));
    app = buildApp(h.db, testEnv(url), undefined, new LocalFileStore(root));
    admin = await loginToken(app, (await seedUser(h.db, "admin")).email);
    provider = await loginToken(app, (await seedUser(h.db, "provider")).email);
    patient = await registerPatient(app, h.db);
  });
  afterAll(async () => {
    await closeHarness(h);
    await rm(root, { recursive: true, force: true });
  });

  const get = (token: string | undefined, path: string) => request(app).get(`/api/v1${path}`).set(token ? bearer(token) : {});
  const post = (token: string | undefined, path: string, body: unknown = {}) => request(app).post(`/api/v1${path}`).set(token ? bearer(token) : {}).send(body as object);
  const patch = (token: string | undefined, path: string, body: unknown) => request(app).patch(`/api/v1${path}`).set(token ? bearer(token) : {}).send(body as object);
  const addHospital = (o: Record<string, unknown> = {}) => h.db.hospital.create({ data: { name: uniq("Test Hospital"), isDemo: true, ...o } });
  const addSlot = (hospitalId: string, startOffsetHours: number, durationMinutes = 30) => {
    const startsAt = new Date(Date.now() + startOffsetHours * HOUR);
    return h.db.availabilitySlot.create({ data: { hospitalId, startsAt, endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000) } });
  };

  describe("reading the directory", () => {
    it("is open to any signed-in user and closed to anonymous callers", async () => {
      const hospital = await addHospital();
      for (const token of [patient.token, provider, admin]) {
        const res = await get(token, `/hospitals/${hospital.id}`);
        expect(res.status).toBe(200);
        expect(Object.keys(res.body.data).sort()).toEqual(HOSPITAL_KEYS);
      }
      expect((await get(undefined, "/hospitals")).status).toBe(401);
      expect((await get(undefined, `/hospitals/${hospital.id}`)).status).toBe(401);
    });

    it("labels demo data and shows only active hospitals, except to an admin who asks", async () => {
      const demo = await addHospital({ isDemo: true });
      const real = await addHospital({ isDemo: false });
      const off = await addHospital({ isActive: false });
      const ids = (res: { body: { data: Array<{ id: string }> } }) => res.body.data.map((x) => x.id);
      const listed = await get(patient.token, "/hospitals?limit=100");
      expect(ids(listed)).toEqual(expect.arrayContaining([demo.id, real.id]));
      expect(ids(listed)).not.toContain(off.id);
      expect(listed.body.data.find((x: { id: string }) => x.id === demo.id).isDemo).toBe(true);
      expect(listed.body.data.find((x: { id: string }) => x.id === real.id).isDemo).toBe(false);

      expect(ids(await get(admin, "/hospitals?limit=100&includeInactive=true"))).toContain(off.id);
      expect((await get(patient.token, "/hospitals?includeInactive=true")).status).toBe(403);
      expect((await get(provider, "/hospitals?includeInactive=true")).status).toBe(403);
      expect((await get(patient.token, `/hospitals/${off.id}`)).status).toBe(404);
      expect((await get(admin, `/hospitals/${off.id}`)).status).toBe(200);
    });

    it("filters, pages, and rejects bad input", async () => {
      const tag = uniq("Zed");
      const a = await addHospital({ name: `${tag} Alpha`, city: "Pune", specialties: ["Cardiology"] });
      await addHospital({ name: `${tag} Beta`, city: "Mumbai", specialties: ["Cardiology", "Neurology"] });
      await addHospital({ name: `${tag} Gamma`, city: "pune", specialties: [] });
      expect((await get(patient.token, `/hospitals?q=${encodeURIComponent(tag)}`)).body.data).toHaveLength(3);
      expect((await get(patient.token, `/hospitals?q=${encodeURIComponent(tag)}&city=PUNE`)).body.data).toHaveLength(2);
      expect((await get(patient.token, `/hospitals?q=${encodeURIComponent(tag)}&specialty=Neurology`)).body.data).toHaveLength(1);
      const first = await get(patient.token, `/hospitals?q=${encodeURIComponent(tag)}&limit=2`);
      expect(first.body.data.map((x: { name: string }) => x.name)).toEqual([`${tag} Alpha`, `${tag} Beta`]);
      const second = await get(patient.token, `/hospitals?q=${encodeURIComponent(tag)}&limit=2&cursor=${first.body.page.nextCursor}`);
      expect(second.body.data).toHaveLength(1);
      expect(second.body.page.nextCursor).toBeNull();
      expect(a.id).toBeDefined();
      for (const q of ["limit=0", "limit=101", "cursor=x", "foo=1", "q=", `q=${"x".repeat(81)}`, "includeInactive=yes"]) expect((await get(patient.token, `/hospitals?${q}`)).status, q).toBe(400);
      // search text is data, never query syntax
      expect((await get(patient.token, `/hospitals?q=${encodeURIComponent("%'; DROP TABLE \"Hospital\";--")}`)).status).toBe(200);
    });

    it("returns 404 for unknown and malformed ids", async () => {
      for (const bad of ["00000000-0000-4000-8000-000000000000", "not-a-uuid", "%00"]) {
        expect((await get(patient.token, `/hospitals/${bad}`)).status, bad).toBe(404);
        expect((await get(patient.token, `/hospitals/${bad}/availability`)).status, bad).toBe(404);
      }
    });
  });

  describe("managing the directory", () => {
    it("lets an admin create a hospital that is never marked demo, and audits it", async () => {
      const name = uniq("Admin Added");
      const res = await post(admin, "/admin/hospitals", { name, city: "Pune", phone: "+91 20 5555 0100", specialties: ["Cardiology", "cardiology", "Neurology"] });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ name, city: "Pune", isActive: true, isDemo: false, specialties: ["Cardiology", "Neurology"] });
      expect(await h.db.auditEvent.count({ where: { action: "hospital.created", resourceId: res.body.data.id } })).toBe(1);
    });

    it("validates input, and never lets a client set demo or active state on create", async () => {
      const bad: unknown[] = [{}, { name: "" }, { name: "x".repeat(121) }, { name: "a\nb" }, { name: "ok", phone: "abc" }, { name: "ok", specialties: "x" }, { name: "ok", specialties: Array.from({ length: 21 }, (_, i) => `s${i}`) },
        { name: "ok", isDemo: true }, { name: "ok", isActive: false }, { name: "ok", id: "x" }];
      for (const b of bad) expect((await post(admin, "/admin/hospitals", b)).status, JSON.stringify(b).slice(0, 60)).toBe(400);
    });

    it("refuses patients, providers, and anonymous callers on every admin route", async () => {
      const hospital = await addHospital();
      for (const token of [patient.token, provider]) {
        expect((await post(token, "/admin/hospitals", { name: uniq("Nope") })).status).toBe(403);
        expect((await patch(token, `/admin/hospitals/${hospital.id}`, { name: "Hijacked" })).status).toBe(403);
        expect((await post(token, `/admin/hospitals/${hospital.id}/deactivate`)).status).toBe(403);
      }
      expect((await post(undefined, "/admin/hospitals", { name: "x" })).status).toBe(401);
      expect((await h.db.hospital.findUniqueOrThrow({ where: { id: hospital.id } })).name).toBe(hospital.name);
    });

    it("updates fields with an audit of names only, skips no-ops, and rejects unknown fields", async () => {
      const hospital = await addHospital({ city: "Pune" });
      const res = await patch(admin, `/admin/hospitals/${hospital.id}`, { city: "Nashik", specialties: ["ENT"] });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ city: "Nashik", specialties: ["ENT"], isDemo: true });
      const events = await h.db.auditEvent.findMany({ where: { action: "hospital.updated", resourceId: hospital.id } });
      expect(events).toHaveLength(1);
      expect((events[0]?.metadata as { changedFields: string[] }).changedFields.sort()).toEqual(["city", "specialties"]);
      expect(JSON.stringify(events)).not.toMatch(/Nashik|ENT/);
      await patch(admin, `/admin/hospitals/${hospital.id}`, { city: "Nashik" });
      expect(await h.db.auditEvent.count({ where: { action: "hospital.updated", resourceId: hospital.id } })).toBe(1);
      for (const b of [{}, { isDemo: false }, { id: "x" }, { createdAt: "2000-01-01" }, { city: "Pune", isDemo: false }]) expect((await patch(admin, `/admin/hospitals/${hospital.id}`, b)).status, JSON.stringify(b)).toBe(400);
      expect((await h.db.hospital.findUniqueOrThrow({ where: { id: hospital.id } })).isDemo).toBe(true);
      expect((await patch(admin, "/admin/hospitals/00000000-0000-4000-8000-000000000000", { city: "x" })).status).toBe(404);
    });

    it("deactivates and reactivates: hidden from patients, still visible to admins, nothing cancelled silently", async () => {
      const hospital = await addHospital();
      const slot = await addSlot(hospital.id, 48);
      const booked = await post(patient.token, "/appointments", { slotId: slot.id });
      expect(booked.status).toBe(201);

      const off = await post(admin, `/admin/hospitals/${hospital.id}/deactivate`);
      expect(off.status).toBe(200);
      expect(off.body.data.isActive).toBe(false);
      expect(await h.db.auditEvent.count({ where: { action: "hospital.deactivated", resourceId: hospital.id } })).toBe(1);
      expect((await get(patient.token, `/hospitals/${hospital.id}`)).status).toBe(404);
      expect((await get(patient.token, `/hospitals/${hospital.id}/availability`)).status).toBe(404);
      expect((await get(admin, `/hospitals/${hospital.id}/availability`)).status).toBe(200);
      // The existing appointment is untouched, and nobody can book the hospital any more.
      expect((await h.db.appointment.findUniqueOrThrow({ where: { id: booked.body.data.id } })).status).toBe("confirmed");
      const other = await registerPatient(app, h.db);
      const slot2 = await addSlot(hospital.id, 72);
      expect((await post(other.token, "/appointments", { slotId: slot2.id })).status).toBe(409);

      expect((await patch(admin, `/admin/hospitals/${hospital.id}`, { isActive: true })).body.data.isActive).toBe(true);
      expect((await post(other.token, "/appointments", { slotId: slot2.id })).status).toBe(201);
    });

    it("gives an admin no access to medical records", async () => {
      const rx = await h.db.prescriptionRecord.create({
        data: { patientId: patient.patientId, originalStorageKey: uniq("k"), originalFileName: "f", originalMimeType: "image/png", originalSizeBytes: 1, originalSha256: "0".repeat(64) },
      });
      expect((await get(admin, "/prescriptions")).status).toBe(403);
      expect((await get(admin, `/prescriptions/${rx.id}`)).status).toBe(403);
      expect((await get(admin, "/patients/me")).status).toBe(403);
      expect((await get(admin, "/medication-schedules")).status).toBe(403);
      expect((await get(admin, `/health-history?patientId=${patient.patientId}`)).status).toBe(403);
    });
  });

  describe("availability", () => {
    it("lists upcoming slots as open or booked, with nothing about who booked", async () => {
      const hospital = await addHospital();
      const open = await addSlot(hospital.id, 3);
      const taken = await addSlot(hospital.id, 4);
      await addSlot(hospital.id, -5); // already passed
      await post(patient.token, "/appointments", { slotId: taken.id });
      const res = await get(patient.token, `/hospitals/${hospital.id}/availability`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((s: { id: string; status: string }) => [s.id, s.status])).toEqual([[open.id, "open"], [taken.id, "booked"]]);
      expect(Object.keys(res.body.data[0]).sort()).toEqual(["endsAt", "id", "startsAt", "status"]);
      const text = JSON.stringify(res.body);
      for (const hidden of [patient.patientId, patient.userId, patient.email, "patientId"]) expect(text).not.toContain(hidden);
    });

    it("frees a slot again when its appointment is cancelled", async () => {
      const hospital = await addHospital();
      const slot = await addSlot(hospital.id, 5);
      const appt = (await post(patient.token, "/appointments", { slotId: slot.id })).body.data;
      expect((await get(provider, `/hospitals/${hospital.id}/availability`)).body.data[0].status).toBe("booked");
      await post(patient.token, `/appointments/${appt.id}/cancel`);
      expect((await get(provider, `/hospitals/${hospital.id}/availability`)).body.data[0].status).toBe("open");
    });

    it("defaults to the next 14 days, honours from and to, pages, and bounds the range", async () => {
      const hospital = await addHospital();
      const s1 = await addSlot(hospital.id, 24 * 2);
      const s2 = await addSlot(hospital.id, 24 * 10);
      await addSlot(hospital.id, 24 * 20);
      const def = await get(patient.token, `/hospitals/${hospital.id}/availability`);
      expect(def.body.data.map((s: { id: string }) => s.id)).toEqual([s1.id, s2.id]);
      const from = new Date(Date.now() + 24 * 5 * HOUR).toISOString();
      const to = new Date(Date.now() + 24 * 25 * HOUR).toISOString();
      expect((await get(patient.token, `/hospitals/${hospital.id}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).body.data).toHaveLength(2);
      const page1 = await get(patient.token, `/hospitals/${hospital.id}/availability?limit=1`);
      const page2 = await get(patient.token, `/hospitals/${hospital.id}/availability?limit=1&cursor=${page1.body.page.nextCursor}`);
      expect([page1.body.data[0].id, page2.body.data[0].id]).toEqual([s1.id, s2.id]);
      // A "from" in the past never reveals past slots.
      const past = await get(patient.token, `/hospitals/${hospital.id}/availability?from=${encodeURIComponent(new Date(Date.now() - 2 * 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 5 * 86_400_000).toISOString())}`);
      expect(past.status).toBe(200);
      expect(past.body.data.every((s: { startsAt: string }) => new Date(s.startsAt).getTime() > Date.now())).toBe(true);
      const tooWide = `from=${encodeURIComponent("2026-01-01T00:00:00Z")}&to=${encodeURIComponent("2026-03-01T00:00:00Z")}`;
      for (const q of [tooWide, `from=${encodeURIComponent(to)}&to=${encodeURIComponent(from)}`, "from=yesterday", "limit=0", "limit=201", "cursor=x", "x=1"]) {
        expect((await get(patient.token, `/hospitals/${hospital.id}/availability?${q}`)).status, q).toBe(400);
      }
    });
  });
});
