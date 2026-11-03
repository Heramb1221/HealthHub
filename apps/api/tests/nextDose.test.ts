import { describe, expect, it } from "vitest";
import { nextDose } from "../src/modules/schedules/nextDose.js";
import type { ScheduleDto } from "../src/modules/schedules/service.js";

const s = (over: Partial<ScheduleDto> = {}): ScheduleDto => ({
  id: "a", prescriptionId: "p", sourceVersionNumber: 2, sourceStatus: "current", medication: { name: "M", strength: null, dose: null, route: null, frequency: null, duration: null, instructions: null },
  startDate: "2026-10-01", endDate: null, reminderTimes: ["08:00", "20:00"], remindersEnabled: true, remindersActive: true, timezone: "Asia/Kolkata",
  isActive: true, recentDoseEvents: [], notice: "", createdAt: "", updatedAt: "", ...over,
});
const now = new Date("2026-10-25T03:00:00Z"); // 08:30 in India

describe("nextDose (dashboard)", () => {
  it("returns the next dose in the schedule's own zone", () => {
    const n = nextDose([s()], now);
    expect(n?.at.toISOString()).toBe("2026-10-25T14:30:00.000Z");
    expect(n?.time).toBe("20:00");
  });
  it("rolls to tomorrow, and picks the earliest across schedules and zones", () => {
    expect(nextDose([s()], new Date("2026-10-25T15:00:00Z"))?.at.toISOString()).toBe("2026-10-26T02:30:00.000Z");
    const ny = s({ id: "ny", timezone: "America/New_York", reminderTimes: ["23:45"] }); // 03:45Z
    const india = s({ id: "in", reminderTimes: ["09:00"] }); // 03:30Z
    expect(nextDose([ny, india], now)?.scheduleId).toBe("in");
  });
  it("invents nothing: no reminder applies, no next dose", () => {
    for (const o of [{ remindersActive: false }, { reminderTimes: [] }, { endDate: "2026-10-24" }, { startDate: "2027-12-01" }]) {
      expect(nextDose([s(o)], now), JSON.stringify(o)).toBeNull();
    }
  });
});
