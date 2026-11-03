import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockExtractionProvider } from "../../src/extraction/mockProvider.js";
import { addDays, dateInZone, zonedInstant } from "../../src/lib/zonedTime.js";
import { LocalFileStore } from "../../src/storage/localFileStore.js";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, registerPatient, testEnv } from "./appHelpers.js";
import { rxKit } from "./rxHelpers.js";

const TZ = "Asia/Kolkata";

describe.skipIf(!TEST_DATABASE_URL)("dose events follow the schedule's reminder slots", () => {
  let h: Harness;
  let root: string;
  let app: ReturnType<typeof buildApp>;
  let kit: ReturnType<typeof rxKit>;
  const url = TEST_DATABASE_URL as string;

  beforeAll(async () => {
    h = await openHarness(url);
    root = await mkdtemp(join(tmpdir(), "hh-slots-test-"));
    app = buildApp(h.db, testEnv(url), undefined, new LocalFileStore(root), new MockExtractionProvider());
    kit = rxKit(app, h);
  });
  afterAll(async () => {
    await closeHarness(h);
    await rm(root, { recursive: true, force: true });
  });

  async function scheduleWithSlots() {
    const p = await registerPatient(app, h.db);
    const rx = await kit.processed(p.token, "clear-001");
    expect((await kit.correct(p.token, rx, { baseVersionNumber: 1, prescriberName: "Dr. Reviewed (synthetic)" })).status).toBe(201);
    const today = dateInZone(new Date(), TZ);
    const created = await request(app).post("/api/v1/medication-schedules").set(bearer(p.token)).send({
      prescriptionId: rx, versionNumber: 2, medicationPosition: 0, startDate: addDays(today, -3), timezone: TZ,
      reminderTimes: ["08:00", "20:00"], remindersEnabled: true,
    });
    expect(created.status).toBe(201);
    const yesterday = addDays(today, -1);
    const slot = (time: string) => (zonedInstant(yesterday, time, TZ) as Date).toISOString();
    const dose = (body: unknown) => request(app).post(`/api/v1/medication-schedules/${created.body.data.id}/dose-events`).set(bearer(p.token)).send(body as object);
    return { p, id: created.body.data.id as string, slot, dose };
  }

  it("records a dose at the exact slot in the schedule's own time zone", async () => {
    const { slot, dose } = await scheduleWithSlots();
    const res = await dose({ scheduledFor: slot("08:00"), status: "taken" });
    expect(res.status).toBe(201);
    expect(res.body.data.scheduledFor).toBe(slot("08:00"));
  });

  it("snaps a slightly-off timestamp to the slot, and treats an identical retry as the same dose", async () => {
    const { id, slot, dose } = await scheduleWithSlots();
    const off = new Date(Date.parse(slot("20:00")) + 20_000).toISOString(); // 20 seconds late
    const first = await dose({ scheduledFor: off, status: "taken" });
    const retry = await dose({ scheduledFor: slot("20:00"), status: "taken" });
    expect(first.status).toBe(201);
    expect(first.body.data.scheduledFor).toBe(slot("20:00"));
    expect(retry.status).toBe(201);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(await h.db.doseEvent.count({ where: { scheduleId: id } })).toBe(1);
  });

  it("refuses times that are not reminder slots, including a slot computed in the wrong time zone", async () => {
    const { slot, dose } = await scheduleWithSlots();
    const notASlot = new Date(Date.parse(slot("08:00")) + 7 * 60_000).toISOString();
    expect((await dose({ scheduledFor: notASlot, status: "taken" })).status).toBe(400);
    // 08:00 UTC is 13:30 in India: what a client using the wrong zone would send
    const wrongZone = `${slot("08:00").slice(0, 10)}T08:00:00.000Z`;
    expect((await dose({ scheduledFor: wrongZone, status: "taken" })).status).toBe(400);
  });

  it("refuses to record the same dose with a different answer, and keeps the first", async () => {
    const { id, slot, dose } = await scheduleWithSlots();
    expect((await dose({ scheduledFor: slot("08:00"), status: "taken" })).status).toBe(201);
    const conflict = await dose({ scheduledFor: slot("08:00"), status: "skipped" });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.message).toMatch(/already recorded as taken/);
    const stored = await h.db.doseEvent.findMany({ where: { scheduleId: id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.status).toBe("taken");
  });
});
