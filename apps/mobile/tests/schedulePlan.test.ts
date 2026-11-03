import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MedicationSchedule } from "../src/api/types.ts";
import { doseSlots, MAX_PLANNED_REMINDERS, nextReminder, planReminders, REMINDER_ID_PREFIX } from "../src/lib/schedule.ts";

const make = (over: Partial<MedicationSchedule> = {}): MedicationSchedule => ({
  id: "s1", prescriptionId: "p", sourceVersionNumber: 2, sourceStatus: "current",
  medication: { name: "Med", strength: "5 mg", dose: "1", route: null, frequency: "daily", duration: null, instructions: null },
  startDate: "2026-10-01", endDate: null, reminderTimes: ["08:00", "20:00"], remindersEnabled: true, remindersActive: true, timezone: "Asia/Kolkata",
  isActive: true, recentDoseEvents: [], notice: "n", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", ...over,
});
const at = (iso: string) => new Date(iso);
const isoList = (xs: { at: Date }[]) => xs.map((x) => x.at.toISOString());

describe("planReminders", () => {
  const now = at("2026-10-25T03:00:00Z"); // 08:30 in India

  it("lists the upcoming doses in the schedule's own zone, soonest first", () => {
    const plan = planReminders([make()], now, { horizonDays: 1 });
    assert.deepEqual(isoList(plan), ["2026-10-25T14:30:00.000Z", "2026-10-26T02:30:00.000Z", "2026-10-26T14:30:00.000Z"]);
  });

  it("never plans a dose in the past", () => {
    assert.ok(planReminders([make()], now).every((r) => r.at.getTime() > now.getTime()));
  });

  it("stops after the end date and does not start before the start date", () => {
    const ending = planReminders([make({ endDate: "2026-10-26" })], now);
    assert.equal(ending.at(-1)?.at.toISOString(), "2026-10-26T14:30:00.000Z");
    const future = planReminders([make({ startDate: "2026-10-27" })], now);
    assert.equal(future[0]?.at.toISOString(), "2026-10-27T02:30:00.000Z");
    assert.deepEqual(planReminders([make({ endDate: "2026-10-24" })], now), []); // course already finished
  });

  it("plans nothing for schedules that are paused, switched off, or out of date with the prescription", () => {
    for (const over of [{ isActive: false }, { remindersEnabled: false }, { remindersActive: false }, { reminderTimes: [] }, { reminderTimes: ["bad", "25:00"] }]) {
      assert.deepEqual(planReminders([make(over)], now), [], JSON.stringify(over));
    }
  });

  it("gives every dose a stable, unique identifier and ignores repeated times, so re-planning cannot duplicate", () => {
    const a = planReminders([make({ reminderTimes: ["08:00", "08:00", "20:00"] })], now);
    const b = planReminders([make({ reminderTimes: ["20:00", "08:00"] })], now);
    assert.deepEqual(a.map((r) => r.identifier), b.map((r) => r.identifier));
    assert.equal(new Set(a.map((r) => r.identifier)).size, a.length);
    assert.ok(a.every((r) => r.identifier.startsWith(REMINDER_ID_PREFIX)));
    const two = planReminders([make({ id: "a" }), make({ id: "b" })], now);
    assert.equal(new Set(two.map((r) => r.identifier)).size, two.length);
  });

  it("stays under the operating-system limit", () => {
    const many = Array.from({ length: 12 }, (_, i) => make({ id: `s${i}`, reminderTimes: ["06:00", "10:00", "14:00", "18:00", "22:00"] }));
    const plan = planReminders(many, now);
    assert.equal(plan.length, MAX_PLANNED_REMINDERS);
    assert.deepEqual(plan.map((r) => r.at.getTime()), [...plan.map((r) => r.at.getTime())].sort((x, y) => x - y));
  });

  it("keeps the wall-clock time across the autumn clock change (a 25-hour day)", () => {
    const ny = make({ timezone: "America/New_York", reminderTimes: ["08:00"], startDate: "2026-10-01" });
    const plan = planReminders([ny], at("2026-10-31T00:00:00Z"), { horizonDays: 3 });
    // 31 Oct 08:00 EDT = 12:00Z, then clocks go back: 1 Nov and 2 Nov 08:00 EST = 13:00Z (the day in between is 25 hours)
    assert.deepEqual(isoList(plan), ["2026-10-31T12:00:00.000Z", "2026-11-01T13:00:00.000Z", "2026-11-02T13:00:00.000Z"]);
  });

  it("moves a dose that falls in the spring gap to the first valid moment, so it is not skipped", () => {
    const ny = make({ timezone: "America/New_York", reminderTimes: ["02:30"], startDate: "2026-03-01" });
    const plan = planReminders([ny], at("2026-03-07T12:00:00Z"), { horizonDays: 2 });
    // 7 Mar 02:30 EST = 07:30Z; 8 Mar has no 02:30 so it becomes 03:30 EDT = 07:30Z; 9 Mar 02:30 EDT = 06:30Z
    assert.deepEqual(isoList(plan), ["2026-03-08T07:30:00.000Z", "2026-03-09T06:30:00.000Z"]);
  });

  it("is independent of this machine's time zone", () => {
    // Same answer whatever TZ the test runner has: nothing here reads the device zone. It is 16:00 on the 25th in
    // Auckland, so today's 08:00 has passed and the next one (08:00 on the 26th) is 19:00Z on the 25th.
    const plan = planReminders([make({ timezone: "Pacific/Auckland", reminderTimes: ["08:00"] })], now, { horizonDays: 0 });
    assert.deepEqual(isoList(plan), []);
    const later = planReminders([make({ timezone: "Pacific/Auckland", reminderTimes: ["08:00"] })], now, { horizonDays: 1 });
    assert.deepEqual(isoList(later), ["2026-10-25T19:00:00.000Z"]);
  });
});

describe("nextReminder", () => {
  const now = at("2026-10-25T03:00:00Z");
  it("returns the soonest dose, or nothing when no reminders apply", () => {
    const n = nextReminder([make()], now);
    assert.equal(n?.at.toISOString(), "2026-10-25T14:30:00.000Z");
    assert.equal(n?.time, "20:00");
    assert.equal(nextReminder([make({ remindersActive: false })], now), null);
  });
});

describe("doseSlots", () => {
  const now = at("2026-10-25T09:00:00Z"); // 14:30 in India: the 08:00 dose is past, 20:00 is upcoming

  it("covers yesterday and today in the schedule's zone and flags missed doses", () => {
    const slots = doseSlots(make(), now);
    assert.deepEqual(slots.map((s) => `${s.day}:${s.time}`), ["yesterday:08:00", "yesterday:20:00", "today:08:00", "today:20:00"]);
    assert.equal(slots[2]?.iso, "2026-10-25T02:30:00.000Z");
    assert.ok(slots[2]?.missed && slots[2].canRecord);
    assert.ok(!slots[3]?.missed && !slots[3]?.canRecord); // 20:00 is more than an hour away
  });

  it("matches answers the patient already recorded", () => {
    const events: MedicationSchedule["recentDoseEvents"] = [{ id: "e", scheduleId: "s1", scheduledFor: "2026-10-25T02:30:00.000Z", status: "taken", recordedAt: "x", selfReported: true }];
    const slots = doseSlots(make({ recentDoseEvents: events }), now);
    assert.equal(slots[2]?.status, "taken");
    assert.equal(slots[2]?.missed, false);
  });

  it("does not offer doses before the start date or after the end date, nor to a paused schedule", () => {
    assert.equal(doseSlots(make({ startDate: "2026-10-25" }), now).filter((s) => s.day === "yesterday").length, 0);
    assert.equal(doseSlots(make({ endDate: "2026-10-24" }), now).filter((s) => s.day === "today").length, 0);
    assert.ok(doseSlots(make({ isActive: false }), now).every((s) => !s.canRecord));
  });
});
