import { describe, expect, it } from "vitest";
import { buildEvent, calendarEventId, reconcileScheduleEvents, wantedTimes } from "../src/modules/calendar/events.js";
import type { ScheduleDto } from "../src/modules/schedules/service.js";

const schedule = (over: Partial<ScheduleDto> = {}): ScheduleDto => ({
  id: "6f1c2f0e-3b52-4f4b-9a5e-0d6e0c1d7a11", prescriptionId: "p", sourceVersionNumber: 2, sourceStatus: "current",
  medication: { name: "Metformin", strength: "500 mg", dose: "1 tablet", route: null, frequency: "twice daily", duration: null, instructions: "after food" },
  startDate: "2026-10-20", endDate: null, reminderTimes: ["08:00", "20:00"], remindersEnabled: true, remindersActive: true,
  timezone: "Asia/Kolkata", isActive: true, recentDoseEvents: [], notice: "n", createdAt: "", updatedAt: "", ...over,
});
const NOW = new Date("2026-10-25T03:00:00Z");

/** An in-memory stand-in for Google Calendar's events API (no network). */
function fakeGoogle() {
  const store = new Map<string, Record<string, unknown>>();
  const log: string[] = [];
  const fetchImpl = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
    const id = decodeURIComponent(url.pathname.split("/events/")[1] ?? "");
    log.push(`${method} ${id || "(list)"}`);
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (method === "GET") {
      const [k, v] = (url.searchParams.get("privateExtendedProperty") ?? "=").split("=");
      const items = [...store.values()].filter((e) => ((e.extendedProperties as { private: Record<string, string> }).private[k as string]) === v);
      return json({ items });
    }
    if (method === "POST") {
      if (store.has(body?.id as string)) return json({}, 409);
      store.set(body?.id as string, body as Record<string, unknown>);
      return json({ htmlLink: `https://calendar.example/${body?.id}` });
    }
    if (method === "PUT") { store.set(id, body as Record<string, unknown>); return json({ htmlLink: `https://calendar.example/${id}` }); }
    if (method === "DELETE") return store.delete(id) ? new Response(null, { status: 204 }) : json({}, 410);
    return json({}, 400);
  }) as unknown as typeof fetch;
  return { store, log, fetchImpl };
}
const run = (g: ReturnType<typeof fakeGoogle>, s: ScheduleDto, showMedicineNames = false) => reconcileScheduleEvents(g.fetchImpl, "tok", s, { showMedicineNames, now: NOW });

describe("calendar event content", () => {
  it("uses a deterministic id valid for Google, different per time and per schedule", () => {
    const a = calendarEventId("s1", "08:00");
    expect(a).toMatch(/^sehat[0-9a-f]{32}$/);
    expect(calendarEventId("s1", "08:00")).toBe(a);
    expect(calendarEventId("s1", "20:00")).not.toBe(a);
    expect(calendarEventId("s2", "08:00")).not.toBe(a);
  });

  it("names no medicine unless the patient opts in", () => {
    const quiet = JSON.stringify(buildEvent(schedule(), "08:00", { showMedicineNames: false, now: NOW }).payload);
    for (const secret of ["Metformin", "500 mg", "after food"]) expect(quiet).not.toContain(secret);
    const named = JSON.stringify(buildEvent(schedule(), "08:00", { showMedicineNames: true, now: NOW }).payload);
    expect(named).toContain("Metformin");
  });

  it("writes times in the schedule's zone, starts today (never in the past), and ends 15 minutes later", () => {
    const e = buildEvent(schedule({ startDate: "2026-09-01" }), "08:00", { showMedicineNames: false, now: NOW }).payload as { start: { dateTime: string; timeZone: string }; end: { dateTime: string } };
    expect(e.start).toEqual({ dateTime: "2026-10-25T08:00:00", timeZone: "Asia/Kolkata" });
    expect(e.end.dateTime).toBe("2026-10-25T08:15:00");
    const future = buildEvent(schedule({ startDate: "2026-11-02" }), "08:00", { showMedicineNames: false, now: NOW }).payload as { start: { dateTime: string } };
    expect(future.start.dateTime).toBe("2026-11-02T08:00:00");
  });

  it("ends a late dose on the next day instead of before it starts", () => {
    const e = buildEvent(schedule(), "23:55", { showMedicineNames: false, now: NOW }).payload as { start: { dateTime: string }; end: { dateTime: string } };
    expect(e.start.dateTime).toBe("2026-10-25T23:55:00");
    expect(e.end.dateTime).toBe("2026-10-26T00:10:00");
  });

  it("stops the series at the end of the schedule's last day in ITS zone, so a western evening dose isn't cut off", () => {
    const la = buildEvent(schedule({ timezone: "America/Los_Angeles", endDate: "2026-10-31" }), "20:00", { showMedicineNames: false, now: NOW }).payload as { recurrence: string[] };
    expect(la.recurrence).toEqual(["RRULE:FREQ=DAILY;UNTIL=20261101T065900Z"]); // 23:59 PDT on 31 Oct
    expect(buildEvent(schedule(), "08:00", { showMedicineNames: false, now: NOW }).payload.recurrence).toEqual(["RRULE:FREQ=DAILY"]);
  });

  it("only offers reminders that are on and current, and invents no time when there is none", () => {
    expect(wantedTimes(schedule())).toEqual(["08:00", "20:00"]);
    for (const o of [{ remindersActive: false }, { isActive: false }, { reminderTimes: [] }]) expect(wantedTimes(schedule(o)), JSON.stringify(o)).toEqual([]);
  });
});

describe("calendar reconcile never duplicates and always cleans up", () => {
  it("creates one event per time, and syncing again updates in place (no duplicates)", async () => {
    const g = fakeGoogle();
    const first = await run(g, schedule());
    expect(first).toMatchObject({ created: 2, updated: 0, removed: 0, failed: 0 });
    const second = await run(g, schedule());
    expect(second).toMatchObject({ created: 0, updated: 2, removed: 0, failed: 0 });
    const third = await run(g, schedule());
    expect(third).toMatchObject({ created: 0, updated: 2 });
    expect(g.store.size).toBe(2);
  });

  it("removes an event whose time was edited out, and keeps the rest", async () => {
    const g = fakeGoogle();
    await run(g, schedule());
    const after = await run(g, schedule({ reminderTimes: ["08:00", "21:30"] }));
    expect(after).toMatchObject({ created: 1, updated: 1, removed: 1 });
    expect(g.store.size).toBe(2);
    expect(g.store.has(calendarEventId(schedule().id, "20:00"))).toBe(false);
    expect(g.store.has(calendarEventId(schedule().id, "21:30"))).toBe(true);
  });

  it("removes every event when the schedule is paused, finished, switched off or out of date", async () => {
    for (const stop of [{ isActive: false }, { remindersEnabled: false, remindersActive: false }, { remindersActive: false, sourceStatus: "changed" as const }, { reminderTimes: [] }]) {
      const g = fakeGoogle();
      await run(g, schedule());
      expect(g.store.size).toBe(2);
      const r = await run(g, schedule(stop));
      expect(r.removed, JSON.stringify(stop)).toBe(2);
      expect(g.store.size).toBe(0);
    }
  });

  it("does not touch another schedule's events", async () => {
    const g = fakeGoogle();
    await run(g, schedule());
    await run(g, schedule({ id: "11111111-1111-4111-8111-111111111111" }));
    const r = await run(g, schedule({ remindersActive: false }));
    expect(r.removed).toBe(2);
    expect(g.store.size).toBe(2);
  });

  it("counts failures instead of pretending success", async () => {
    const broken = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const r = await reconcileScheduleEvents(broken, "tok", schedule(), { showMedicineNames: false, now: NOW });
    expect(r.failed).toBeGreaterThan(0);
    expect(r.created + r.updated).toBe(0);
  });
});
