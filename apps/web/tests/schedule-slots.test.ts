import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MedicationSchedule } from "../src/lib/api/types";
import { dueSlots, nextReminder, slotsForDay } from "../src/lib/schedule";

const make = (o: Partial<MedicationSchedule> = {}): MedicationSchedule => ({
  id: "s1", prescriptionId: "p", medicationName: "Med", strength: null, dose: "1", frequency: null,
  times: ["08:00", "20:00"], startDate: "2026-10-20", endDate: null, active: true, timezone: "Asia/Kolkata", doseEvents: [], ...o,
});
const iso = (d: Date | undefined) => d?.toISOString();
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0); // viewer's local calendar day

describe("slotsForDay uses the schedule's own time zone", () => {
  it("08:00 India time is 02:30 UTC whatever zone this machine is in", () => {
    const slots = slotsForDay([make()], day(2026, 10, 25));
    assert.deepEqual(slots.map((s) => iso(s.at)), ["2026-10-25T02:30:00.000Z", "2026-10-25T14:30:00.000Z"]);
  });

  it("moves the instant, not the wall-clock time, across daylight-saving changes", () => {
    const ny = make({ timezone: "America/New_York", times: ["01:30", "02:30", "08:00"], startDate: "2026-03-01" });
    assert.deepEqual(slotsForDay([ny], day(2026, 3, 8)).map((s) => iso(s.at)), ["2026-03-08T06:30:00.000Z", "2026-03-08T07:30:00.000Z", "2026-03-08T12:00:00.000Z"]);
    assert.equal(iso(slotsForDay([ny], day(2026, 11, 1))[0]?.at), "2026-11-01T05:30:00.000Z"); // fall back: first 01:30
  });

  it("treats start and end as calendar days, inclusive", () => {
    const s = make({ startDate: "2026-10-25", endDate: "2026-10-26" });
    assert.equal(slotsForDay([s], day(2026, 10, 24)).length, 0);
    assert.equal(slotsForDay([s], day(2026, 10, 25)).length, 2);
    assert.equal(slotsForDay([s], day(2026, 10, 26)).length, 2);
    assert.equal(slotsForDay([s], day(2026, 10, 27)).length, 0);
  });

  it("shows nothing for paused schedules and ignores malformed times", () => {
    assert.equal(slotsForDay([make({ active: false })], day(2026, 10, 25)).length, 0);
    assert.equal(slotsForDay([make({ times: ["8am", "25:00", "08:00"] })], day(2026, 10, 25)).length, 1);
  });

  it("links a recorded dose to its slot", () => {
    const taken = { id: "e", scheduleId: "s1", scheduledFor: "2026-10-25T02:30:00.000Z", status: "taken" as const, recordedAt: "2026-10-25T03:00:00.000Z" };
    const slots = slotsForDay([make({ doseEvents: [taken] })], day(2026, 10, 25));
    assert.equal(slots[0]?.event?.status, "taken");
    assert.equal(slots[1]?.event, null);
  });
});

describe("nextReminder", () => {
  const now = new Date("2026-10-25T03:00:00Z"); // 08:30 in India

  it("finds the next untaken slot in the schedule's zone", () => {
    assert.equal(iso(nextReminder([make()], now)?.at), "2026-10-25T14:30:00.000Z");
  });

  it("skips a slot that was already recorded, and moves to the next day when none are left", () => {
    const early = new Date("2026-10-25T02:00:00Z");
    const taken = { id: "e", scheduleId: "s1", scheduledFor: "2026-10-25T02:30:00.000Z", status: "taken" as const, recordedAt: "x" };
    assert.equal(iso(nextReminder([make({ doseEvents: [taken] })], early)?.at), "2026-10-25T14:30:00.000Z");
    assert.equal(iso(nextReminder([make()], new Date("2026-10-25T15:00:00Z"))?.at), "2026-10-26T02:30:00.000Z");
  });

  it("does not remind for schedules that are off, paused, finished, or out of date with the prescription", () => {
    for (const o of [{ remindersEnabled: false }, { remindersActive: false }, { active: false }, { endDate: "2026-10-24" }]) {
      assert.equal(nextReminder([make(o)], now), null, JSON.stringify(o));
    }
  });

  it("picks the earliest across schedules in different zones", () => {
    const ny = make({ id: "ny", timezone: "America/New_York", times: ["23:45"] }); // 03:45Z on the 25th
    const india = make({ id: "in", times: ["09:00"] }); // 03:30Z today
    assert.equal(nextReminder([ny, india], now)?.schedule.id, "in");
  });
});


describe("dueSlots (alerts while the page is open)", () => {
  it("returns a dose only in the few minutes after it comes due", () => {
    const s = make();
    assert.equal(dueSlots([s], new Date("2026-10-25T02:32:00Z")).length, 1); // 2 min after 08:00 IST
    assert.equal(dueSlots([s], new Date("2026-10-25T02:29:00Z")).length, 0); // not yet
    assert.equal(dueSlots([s], new Date("2026-10-25T02:40:00Z")).length, 0); // too late: no stale nagging
  });
  it("stays quiet once the dose is recorded, and for schedules that are off or out of date", () => {
    const taken = { id: "e", scheduleId: "s1", scheduledFor: "2026-10-25T02:30:00.000Z", status: "skipped" as const, recordedAt: "x" };
    const at = new Date("2026-10-25T02:32:00Z");
    assert.equal(dueSlots([make({ doseEvents: [taken] })], at).length, 0);
    for (const o of [{ remindersEnabled: false }, { remindersActive: false }, { active: false }]) assert.equal(dueSlots([make(o)], at).length, 0, JSON.stringify(o));
  });
});
