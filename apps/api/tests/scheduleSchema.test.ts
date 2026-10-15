import { describe, expect, it } from "vitest";
import { createScheduleSchema, doseEventSchema, listSchedulesQuerySchema, updateScheduleSchema } from "../src/modules/schedules/schemas.js";

const RX = "3f2b8c1e-9d44-4a7b-8e21-5c0d6a1f7b90";
const DAY = 86_400_000;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const valid = (o: Record<string, unknown> = {}) => ({ prescriptionId: RX, versionNumber: 2, medicationPosition: 0, startDate: day(0), timezone: "UTC", ...o });
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, body: unknown) => schema.safeParse(body).success;

describe("createScheduleSchema", () => {
  it("accepts a minimal and a full request", () => {
    expect(ok(createScheduleSchema, valid())).toBe(true);
    expect(ok(createScheduleSchema, valid({ endDate: day(10), reminderTimes: ["08:00", "20:00"], remindersEnabled: true, timezone: "Asia/Kolkata" }))).toBe(true);
  });

  it("rejects every field it does not own, so the medication text can never be supplied", () => {
    for (const extra of [
      { dose: "999" }, { medicationName: "x" }, { name: "x" }, { strength: "x" }, { frequency: "x" }, { sourceMedicationId: RX },
      { patientId: RX }, { isActive: true }, { verificationStatus: "verified_by_authorized_clinician" }, { confidence: 1 },
    ]) {
      expect(ok(createScheduleSchema, valid(extra)), JSON.stringify(extra)).toBe(false);
    }
  });

  it("requires the version the patient saw and a valid medication position", () => {
    for (const bad of [{ versionNumber: 0 }, { versionNumber: 1.5 }, { versionNumber: "2" }, { medicationPosition: -1 }, { medicationPosition: 30 }, { medicationPosition: 0.5 }, { prescriptionId: "x" }]) {
      expect(ok(createScheduleSchema, valid(bad)), JSON.stringify(bad)).toBe(false);
    }
    const withoutVersion: Record<string, unknown> = valid();
    delete withoutVersion.versionNumber;
    expect(ok(createScheduleSchema, withoutVersion)).toBe(false);
  });

  it("limits the dates", () => {
    expect(ok(createScheduleSchema, valid({ startDate: day(-30) }))).toBe(true);
    expect(ok(createScheduleSchema, valid({ startDate: day(-31) }))).toBe(false);
    expect(ok(createScheduleSchema, valid({ startDate: day(365) }))).toBe(true);
    expect(ok(createScheduleSchema, valid({ startDate: day(366) }))).toBe(false);
    for (const bad of ["2026-02-30", "01/10/2026", "tomorrow", "", 20261012, "2026-10-12T00:00:00Z"]) {
      expect(ok(createScheduleSchema, valid({ startDate: bad })), String(bad)).toBe(false);
    }
    expect(ok(createScheduleSchema, valid({ startDate: day(0), endDate: day(0) }))).toBe(true);
    expect(ok(createScheduleSchema, valid({ startDate: day(0), endDate: day(-1) }))).toBe(false);
    expect(ok(createScheduleSchema, valid({ startDate: day(0), endDate: day(3651) }))).toBe(false);
    expect(ok(createScheduleSchema, valid({ endDate: null }))).toBe(true);
  });

  it("validates reminder times, and cleans them up", () => {
    for (const bad of ["8:00", "24:00", "12:60", "08:00:00", "0800", "", "ab:cd", "08:5", " 08:00"]) {
      expect(ok(createScheduleSchema, valid({ reminderTimes: [bad] })), bad).toBe(false);
    }
    expect(ok(createScheduleSchema, valid({ reminderTimes: Array.from({ length: 13 }, (_, i) => `0${i % 10}:${i < 10 ? "0" : "1"}0`) }))).toBe(false);
    const parsed = createScheduleSchema.parse(valid({ reminderTimes: ["20:00", "08:00", "20:00", "00:00", "23:59"] }));
    expect(parsed.reminderTimes).toEqual(["00:00", "08:00", "20:00", "23:59"]);
  });

  it("will not turn reminders on without a time", () => {
    expect(ok(createScheduleSchema, valid({ remindersEnabled: true }))).toBe(false);
    expect(ok(createScheduleSchema, valid({ remindersEnabled: true, reminderTimes: [] }))).toBe(false);
    expect(ok(createScheduleSchema, valid({ remindersEnabled: true, reminderTimes: ["08:00"] }))).toBe(true);
    expect(ok(createScheduleSchema, valid({ remindersEnabled: false }))).toBe(true);
  });

  it("requires a real time zone and returns it in canonical form", () => {
    // Ambiguous abbreviations and legacy fixed-offset names are refused, as are unknown places and path-like text.
    for (const bad of ["IST", "EST", "PST8PDT", "CET", "GMT", "Mars/Phobos", "", "../etc", "/Asia/Kolkata", "Asia//Kolkata", "UTC+5", "x".repeat(65), 5]) {
      expect(ok(createScheduleSchema, valid({ timezone: bad })), String(bad)).toBe(false);
    }
    expect(createScheduleSchema.parse(valid({ timezone: "utc" })).timezone).toBe("UTC");
    expect(["Asia/Kolkata", "Asia/Calcutta"]).toContain(createScheduleSchema.parse(valid({ timezone: "asia/kolkata" })).timezone);
    const withoutTz: Record<string, unknown> = valid();
    delete withoutTz.timezone;
    expect(ok(createScheduleSchema, withoutTz)).toBe(false);
    for (const good of ["UTC", "Asia/Kolkata", "America/New_York", "Europe/London", "Etc/GMT+5", "Australia/Lord_Howe"]) {
      expect(ok(createScheduleSchema, valid({ timezone: good })), good).toBe(true);
    }
  });

  it("never throws on hostile input", () => {
    for (const bad of [null, undefined, "x", 5, [], [1], { __proto__: { a: 1 } }, JSON.parse('{"__proto__":{"a":1},"prescriptionId":"x"}')]) {
      expect(() => createScheduleSchema.safeParse(bad)).not.toThrow();
    }
  });
});

describe("updateScheduleSchema", () => {
  it("accepts only reminder preferences, end date, and active state", () => {
    for (const good of [{ reminderTimes: ["09:00"] }, { remindersEnabled: false }, { timezone: "UTC" }, { endDate: null }, { endDate: day(5) }, { isActive: false }]) {
      expect(ok(updateScheduleSchema, good), JSON.stringify(good)).toBe(true);
    }
    expect(ok(updateScheduleSchema, {})).toBe(false);
  });

  it("cannot change what the medication is or how much to take", () => {
    for (const bad of [
      { dose: "2 tablets" }, { medicationName: "x" }, { name: "x" }, { strength: "x" }, { frequency: "x" }, { route: "x" }, { duration: "x" },
      { instructions: "x" }, { startDate: day(0) }, { sourceMedicationId: RX }, { prescriptionId: RX }, { patientId: RX }, { sourceStatus: "current" }, { remindersActive: true },
    ]) {
      expect(ok(updateScheduleSchema, bad), JSON.stringify(bad)).toBe(false);
      // Mixed with a legitimate field it must still be an error, not silently dropped.
      expect(ok(updateScheduleSchema, { isActive: false, ...bad }), `mixed ${JSON.stringify(bad)}`).toBe(false);
    }
  });
});

describe("doseEventSchema", () => {
  it("accepts a taken or skipped dose at an instant with a time zone offset", () => {
    expect(ok(doseEventSchema, { scheduledFor: "2026-10-12T08:00:00Z", status: "taken" })).toBe(true);
    expect(ok(doseEventSchema, { scheduledFor: "2026-10-12T08:00:00+05:30", status: "skipped" })).toBe(true);
    expect(doseEventSchema.parse({ scheduledFor: "2026-10-12T08:00:00+05:30", status: "taken" }).scheduledFor.toISOString()).toBe("2026-10-12T02:30:00.000Z");
  });

  it("rejects anything ambiguous or extra", () => {
    for (const bad of [
      { scheduledFor: "2026-10-12T08:00:00", status: "taken" }, { scheduledFor: "2026-10-12", status: "taken" }, { scheduledFor: "yesterday", status: "taken" },
      { scheduledFor: 1760256000000, status: "taken" }, { scheduledFor: "2026-10-12T08:00:00Z", status: "missed" }, { scheduledFor: "2026-10-12T08:00:00Z" },
      { status: "taken" }, { scheduledFor: "2026-10-12T08:00:00Z", status: "taken", selfReported: false }, { scheduledFor: "2026-10-12T08:00:00Z", status: "taken", patientId: RX },
      { scheduledFor: "2026-10-12T08:00:00Z", status: "taken", verified: true },
    ]) {
      expect(ok(doseEventSchema, bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("listSchedulesQuerySchema", () => {
  it("defaults and bounds paging", () => {
    expect(listSchedulesQuerySchema.parse({}).limit).toBe(20);
    for (const bad of [{ limit: "0" }, { limit: "101" }, { cursor: "x" }, { other: "1" }]) expect(ok(listSchedulesQuerySchema, bad), JSON.stringify(bad)).toBe(false);
  });
});
