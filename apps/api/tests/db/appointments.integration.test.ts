import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, loginToken, registerPatient, seedUser, testEnv } from "./appHelpers.js";

const HOUR = 3_600_000;

describe.skipIf(!TEST_DATABASE_URL)("appointments", () => {
  let h: Harness;
  let app: ReturnType<typeof buildApp>;
  const url = TEST_DATABASE_URL as string;
  let n = 0;

  beforeAll(async () => {
    h = await openHarness(url);
    app = buildApp(h.db, testEnv(url));
  });
  afterAll(async () => closeHarness(h));

  const book = (token: string | undefined, body: unknown) => request(app).post("/api/v1/appointments").set(token ? bearer(token) : {}).send(body as object);
  const cancel = (token: string | undefined, id: string) => request(app).post(`/api/v1/appointments/${id}/cancel`).set(token ? bearer(token) : {});
  const list = (token: string | undefined, q = "") => request(app).get(`/api/v1/appointments${q}`).set(token ? bearer(token) : {});
  const hospital = (o: Record<string, unknown> = {}) => h.db.hospital.create({ data: { name: `Appt Hospital ${process.pid}-${(n += 1)}`, isDemo: true, ...o } });
  const slot = (hospitalId: string, startOffsetHours: number, minutes = 30) => {
    const startsAt = new Date(Date.now() + startOffsetHours * HOUR);
    return h.db.availabilitySlot.create({ data: { hospitalId, startsAt, endsAt: new Date(startsAt.getTime() + minutes * 60_000) } });
  };
  const confirmedFor = (slotId: string) => h.db.appointment.count({ where: { slotId, status: "confirmed" } });

  describe("booking", () => {
    it("books an open slot for the signed-in patient and audits it", async () => {
      const p = await registerPatient(app, h.db);
      const hosp = await hospital();
      const s = await slot(hosp.id, 6);
      const res = await book(p.token, { slotId: s.id });
      expect(res.status).toBe(201);
      expect(Object.keys(res.body.data).sort()).toEqual(["cancelledAt", "createdAt", "endsAt", "hospital", "id", "slotId", "startsAt", "status"]);
      expect(res.body.data).toMatchObject({ slotId: s.id, status: "confirmed", cancelledAt: null, hospital: { id: hosp.id, name: hosp.name, isDemo: true } });
      const row = await h.db.appointment.findUniqueOrThrow({ where: { id: res.body.data.id } });
      expect(row).toMatchObject({ patientId: p.patientId, activeSlotId: s.id });
      const audit = await h.db.auditEvent.findMany({ where: { action: "appointment.booked", resourceId: res.body.data.id } });
      expect(audit).toHaveLength(1);
      expect(audit[0]?.metadata).toEqual({ slotId: s.id, hospitalId: hosp.id });
    });

    it("never trusts the client for the patient, status, price, or availability", async () => {
      const p = await registerPatient(app, h.db);
      const other = await registerPatient(app, h.db);
      const s = await slot((await hospital()).id, 6);
      for (const extra of [{ patientId: other.patientId }, { status: "confirmed" }, { price: 0 }, { amount: 1 }, { activeSlotId: s.id }, { isAvailable: true }, { userId: other.userId }]) {
        expect((await book(p.token, { slotId: s.id, ...extra })).status, JSON.stringify(extra)).toBe(400);
      }
      for (const bad of [{}, { slotId: "nope" }, { slotId: 5 }, []]) expect((await book(p.token, bad)).status, JSON.stringify(bad)).toBe(400);
      expect(await confirmedFor(s.id)).toBe(0);
    });

    it("never double-books: a taken slot is refused, however many try", async () => {
      const a = await registerPatient(app, h.db);
      const b = await registerPatient(app, h.db);
      const s = await slot((await hospital()).id, 7);
      expect((await book(a.token, { slotId: s.id })).status).toBe(201);
      const second = await book(b.token, { slotId: s.id });
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe("CONFLICT");
      expect((await book(a.token, { slotId: s.id })).status).toBe(409); // the same patient again
      expect(await confirmedFor(s.id)).toBe(1);
    });

    it("lets exactly one of many simultaneous bookings win", async () => {
      const s = await slot((await hospital()).id, 8);
      const patients = await Promise.all(Array.from({ length: 8 }, () => registerPatient(app, h.db)));
      const results = await Promise.all(patients.map((p) => book(p.token, { slotId: s.id })));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(7);
      expect(await confirmedFor(s.id)).toBe(1);
    });

    it("turns the database's refusal into a clean conflict even when nothing checked first", async () => {
      // Another booking exists that the application never saw: only the constraint can stop this one.
      const a = await registerPatient(app, h.db);
      const b = await registerPatient(app, h.db);
      const s = await slot((await hospital()).id, 9);
      await h.db.appointment.create({ data: { patientId: a.patientId, slotId: s.id, activeSlotId: s.id, status: "confirmed" } });
      const res = await book(b.token, { slotId: s.id });
      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/no longer available/);
      expect(JSON.stringify(res.body)).not.toMatch(/Unique|constraint|P2002|activeSlotId/i);
    });

    it("waits for the patient's row lock instead of racing past the limits", async () => {
      const p = await registerPatient(app, h.db);
      const s = await slot((await hospital()).id, 10);
      await h.pg.query("BEGIN");
      await h.pg.query(`SELECT "id" FROM "Patient" WHERE "id" = $1 FOR NO KEY UPDATE`, [p.patientId]);
      try {
        let finished = false;
        const pending = book(p.token, { slotId: s.id }).then((r) => {
          finished = true;
          return r;
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(finished).toBe(false);
        await h.pg.query("COMMIT");
        expect((await pending).status).toBe(201);
      } finally {
        await h.pg.query("ROLLBACK").catch(() => undefined);
      }
    });

    it("refuses past slots, unknown slots, and slots at a deactivated hospital", async () => {
      const p = await registerPatient(app, h.db);
      const hosp = await hospital();
      expect((await book(p.token, { slotId: (await slot(hosp.id, -2)).id })).status).toBe(409);
      expect((await book(p.token, { slotId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
      const off = await hospital({ isActive: false });
      expect((await book(p.token, { slotId: (await slot(off.id, 5)).id })).status).toBe(409);
    });

    it("stops one patient holding overlapping appointments, but allows back-to-back ones", async () => {
      const p = await registerPatient(app, h.db);
      const a = await slot((await hospital()).id, 20, 60);
      expect((await book(p.token, { slotId: a.id })).status).toBe(201);
      const overlapping = await slot((await hospital()).id, 20.5, 60);
      expect((await book(p.token, { slotId: overlapping.id })).status).toBe(409);
      const backToBack = await slot((await hospital()).id, 21, 30); // starts exactly when the first ends
      expect((await book(p.token, { slotId: backToBack.id })).status).toBe(201);
    });

    it("caps upcoming appointments per patient", async () => {
      const p = await registerPatient(app, h.db);
      const hosp = await hospital();
      for (let i = 0; i < 10; i += 1) {
        const s = await slot(hosp.id, 100 + i * 2, 30);
        await h.db.appointment.create({ data: { patientId: p.patientId, slotId: s.id, activeSlotId: s.id, status: "confirmed" } });
      }
      const res = await book(p.token, { slotId: (await slot(hosp.id, 300)).id });
      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/Too many upcoming/);
    });
  });

  describe("listing and cancelling", () => {
    it("lists only the caller's appointments, newest first, with a status filter and paging", async () => {
      const a = await registerPatient(app, h.db);
      const b = await registerPatient(app, h.db);
      const hosp = await hospital();
      const ids: string[] = [];
      for (const off of [30, 32, 34]) ids.push((await book(a.token, { slotId: (await slot(hosp.id, off)).id })).body.data.id);
      await book(b.token, { slotId: (await slot(hosp.id, 36)).id });
      await cancel(a.token, ids[0] as string);
      const all = await list(a.token);
      expect(all.body.data.map((x: { id: string }) => x.id)).toEqual([ids[2], ids[1], ids[0]]);
      expect((await list(a.token, "?status=cancelled")).body.data.map((x: { id: string }) => x.id)).toEqual([ids[0]]);
      expect((await list(a.token, "?status=confirmed")).body.data).toHaveLength(2);
      const p1 = await list(a.token, "?limit=2");
      const p2 = await list(a.token, `?limit=2&cursor=${p1.body.page.nextCursor}`);
      expect([...p1.body.data, ...p2.body.data].map((x: { id: string }) => x.id)).toEqual([ids[2], ids[1], ids[0]]);
      expect(p2.body.page.nextCursor).toBeNull();
      for (const q of ["?limit=0", "?limit=101", "?cursor=x", "?status=pending", "?x=1"]) expect((await list(a.token, q)).status, q).toBe(400);
    });

    it("cancels, frees the slot for someone else, and is idempotent", async () => {
      const a = await registerPatient(app, h.db);
      const b = await registerPatient(app, h.db);
      const s = await slot((await hospital()).id, 40);
      const appt = (await book(a.token, { slotId: s.id })).body.data;
      const res = await cancel(a.token, appt.id);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: "cancelled", cancelledAt: expect.any(String) });
      const row = await h.db.appointment.findUniqueOrThrow({ where: { id: appt.id } });
      expect(row.activeSlotId).toBeNull();
      const again = await cancel(a.token, appt.id);
      expect(again.status).toBe(200);
      expect(again.body.data.cancelledAt).toBe(res.body.data.cancelledAt);
      expect(await h.db.auditEvent.count({ where: { action: "appointment.cancelled", resourceId: appt.id } })).toBe(1);
      expect((await book(b.token, { slotId: s.id })).status).toBe(201); // freed
      expect((await book(a.token, { slotId: s.id })).status).toBe(409); // and now taken again
    });

    it("hides other patients' appointments and refuses past ones", async () => {
      const a = await registerPatient(app, h.db);
      const b = await registerPatient(app, h.db);
      const appt = (await book(a.token, { slotId: (await slot((await hospital()).id, 44)).id })).body.data;
      expect((await cancel(b.token, appt.id)).status).toBe(404);
      expect((await h.db.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe("confirmed");
      const past = await slot((await hospital()).id, 50);
      const old = await h.db.appointment.create({ data: { patientId: a.patientId, slotId: past.id, activeSlotId: past.id, status: "confirmed" } });
      await h.db.availabilitySlot.update({ where: { id: past.id }, data: { startsAt: new Date(Date.now() - 2 * HOUR), endsAt: new Date(Date.now() - HOUR) } });
      expect((await cancel(a.token, old.id)).status).toBe(409);
      for (const bad of ["00000000-0000-4000-8000-000000000000", "not-a-uuid", "%00"]) expect((await cancel(a.token, bad)).status, bad).toBe(404);
    });
  });

  describe("who may use appointments", () => {
    it("refuses anonymous callers, providers, and admins", async () => {
      const p = await registerPatient(app, h.db);
      const s = await slot((await hospital()).id, 60);
      const appt = (await book(p.token, { slotId: s.id })).body.data;
      for (const f of [() => book(undefined, { slotId: s.id }), () => list(undefined), () => cancel(undefined, appt.id)]) expect((await f()).status).toBe(401);
      for (const role of ["provider", "admin"] as const) {
        const token = await loginToken(app, (await seedUser(h.db, role)).email);
        expect((await book(token, { slotId: (await slot((await hospital()).id, 61)).id })).status, role).toBe(403);
        expect((await list(token)).status, role).toBe(403);
        expect((await cancel(token, appt.id)).status, role).toBe(403);
      }
      expect((await h.db.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe("confirmed");
    });

    it("refuses a former patient whose role changed", async () => {
      const p = await registerPatient(app, h.db);
      const s = await slot((await hospital()).id, 62);
      expect((await book(p.token, { slotId: s.id })).status).toBe(201);
      await h.db.user.update({ where: { id: p.userId }, data: { role: "admin" } });
      expect((await list(p.token)).status).toBe(403);
      expect((await book(p.token, { slotId: (await slot((await hospital()).id, 63)).id })).status).toBe(403);
    });

    it("never causes a server error on hostile bodies", async () => {
      const p = await registerPatient(app, h.db);
      for (const raw of ["null", "[]", '"x"', "{bad", "", '{"__proto__":{"slotId":"x"}}', '{"slotId":{"$ne":null}}', JSON.stringify({ slotId: "x".repeat(10_000) })]) {
        const res = await request(app).post("/api/v1/appointments").set("Content-Type", "application/json").set(bearer(p.token)).send(raw);
        expect(res.status, raw.slice(0, 30)).toBeGreaterThanOrEqual(400);
        expect(res.status, raw.slice(0, 30)).toBeLessThan(500);
      }
    });
  });
});
