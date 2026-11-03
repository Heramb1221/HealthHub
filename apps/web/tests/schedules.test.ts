import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeSchedule, toCreateBody } from "../src/lib/api/medication-schedules";

const base = { prescriptionId: "p1", medicationIndex: 2, medicationName: "X", startDate: "2026-10-25", endDate: null, times: ["08:00", "20:00"], versionNumber: 2 };

describe("schedule create payload", () => {
  it("carries the reviewed version and the exact fields the strict API accepts", () => {
    const body = toCreateBody(base as never);
    assert.deepEqual(Object.keys(body).sort(), ["endDate", "medicationPosition", "prescriptionId", "reminderTimes", "remindersEnabled", "startDate", "timezone", "versionNumber"]);
    assert.equal(body.versionNumber, 2);
    assert.equal(body.medicationPosition, 2);
  });
  it("only turns reminders on when there is at least one time", () => {
    assert.equal(toCreateBody(base as never).remindersEnabled, true);
    assert.equal(toCreateBody({ ...base, times: [] } as never).remindersEnabled, false);
  });
});

describe("normalizeSchedule", () => {
  it("keeps the schedule's time zone and reminder state", () => {
    const s = normalizeSchedule({ id: "a", medicationName: "M", reminderTimes: ["08:00"], startDate: "2026-10-25", timezone: "Asia/Kolkata", remindersEnabled: true, remindersActive: false, sourceStatus: "changed", isActive: true });
    assert.equal(s.timezone, "Asia/Kolkata");
    assert.equal(s.remindersActive, false);
    assert.equal(s.sourceStatus, "changed");
  });
  it("never turns an unknown dose status into 'taken'", () => {
    const s = normalizeSchedule({ id: "a", recentDoseEvents: [{ id: "1", status: "taken", scheduledFor: "x" }, { id: "2", status: "weird", scheduledFor: "y" }, { id: "3", status: "skipped", scheduledFor: "z" }] });
    assert.deepEqual((s.doseEvents ?? []).map((e) => e.status), ["taken", "skipped"]);
  });
});
