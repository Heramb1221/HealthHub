import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, describeError } from "../src/api/errors.ts";
import type { Appointment, MedicationSchedule, Prescription, PrescriptionMedication } from "../src/api/types.ts";
import { nextAppointment } from "../src/lib/appointments.ts";
import { formatCountdown, formatDateOnly, localTimeToIso, toDateInput } from "../src/lib/format.ts";
import { canOfferSchedule, doseLine, isInstructionSafe, medicationReviewReasons } from "../src/lib/safety.ts";
import { enabledReminderTimes, nextReminder } from "../src/lib/schedule.ts";
import { blankToNull, isFutureDateOnly, isValidDateOnly, isValidEmail, isValidTimeOfDay, parseList, passwordProblem } from "../src/lib/validation.ts";

const goodMed: PrescriptionMedication = {
  name: "Paracetamol", strength: "500 mg", dose: "1 tablet", route: "oral", frequency: "twice a day", duration: "3 days", instructions: null, confidence: 0.95,
};

describe("prescription safety policy", () => {
  it("accepts a complete, confident medication", () => {
    assert.equal(isInstructionSafe(goodMed), true);
    assert.equal(doseLine(goodMed), "Paracetamol · 500 mg · 1 tablet · twice a day · 3 days");
  });

  it("flags low confidence at exactly below the threshold", () => {
    assert.deepEqual(medicationReviewReasons({ ...goodMed, confidence: 0.84 }), ["low_confidence"]);
    assert.deepEqual(medicationReviewReasons({ ...goodMed, confidence: 0.85 }), []);
  });

  it("flags every missing required field, including blank strings", () => {
    const reasons = medicationReviewReasons({ ...goodMed, name: null, strength: "  ", dose: null, frequency: "" });
    assert.deepEqual(reasons, ["missing_name", "missing_strength", "missing_dose", "missing_frequency"]);
  });

  it("treats NaN confidence as unsafe and never builds a dose line for unsafe data", () => {
    const bad = { ...goodMed, confidence: Number.NaN };
    assert.equal(isInstructionSafe(bad), false);
    assert.equal(doseLine(bad), null);
  });

  it("only offers a schedule for completed, non-needs-review prescriptions with safe medications", () => {
    const base: Pick<Prescription, "processingStatus" | "verificationStatus"> = { processingStatus: "completed", verificationStatus: "unverified" };
    assert.equal(canOfferSchedule(base, goodMed), true);
    assert.equal(canOfferSchedule({ ...base, verificationStatus: "needs_review" }, goodMed), false);
    assert.equal(canOfferSchedule({ ...base, processingStatus: "processing" }, goodMed), false);
    assert.equal(canOfferSchedule(base, { ...goodMed, dose: null }), false);
  });
});

describe("validation", () => {
  it("validates emails, passwords, dates and times", () => {
    assert.equal(isValidEmail("a@b.co"), true);
    assert.equal(isValidEmail("a@b"), false);
    assert.equal(passwordProblem("short"), "Use at least 10 characters.");
    assert.equal(passwordProblem("long-enough-pw"), null);
    assert.equal(isValidDateOnly("2024-02-29"), true);
    assert.equal(isValidDateOnly("2023-02-29"), false);
    assert.equal(isValidDateOnly("29-02-2024"), false);
    assert.equal(isFutureDateOnly("2999-01-01"), true);
    assert.equal(isFutureDateOnly("2000-01-01"), false);
    assert.equal(isValidTimeOfDay("08:00"), true);
    assert.equal(isValidTimeOfDay("24:00"), false);
    assert.equal(isValidTimeOfDay("8:00"), false);
  });

  it("parses lists and blanks", () => {
    assert.deepEqual(parseList(" a, b ,a,,\nc "), ["a", "b", "c"]);
    assert.equal(blankToNull("  "), null);
    assert.equal(blankToNull(" x "), "x");
  });
});

describe("formatting", () => {
  it("formats calendar dates without timezone shifting", () => {
    assert.equal(formatDateOnly("2000-01-01T00:00:00.000Z"), "1 Jan 2000");
    assert.equal(formatDateOnly("1998-04-23"), "23 Apr 1998");
    assert.equal(formatDateOnly(null), "Not provided");
    assert.equal(toDateInput("2000-01-01T00:00:00.000Z"), "2000-01-01");
  });

  it("builds an ISO instant for a local time and rejects bad input", () => {
    const iso = localTimeToIso("20:30", new Date(2026, 9, 9, 1, 0));
    assert.ok(iso);
    const d = new Date(iso as string);
    assert.equal(d.getHours(), 20);
    assert.equal(d.getMinutes(), 30);
    assert.equal(localTimeToIso("25:00"), null);
  });

  it("formats countdowns", () => {
    const now = new Date(2026, 9, 9, 12, 0);
    assert.equal(formatCountdown(new Date(2026, 9, 9, 12, 9).toISOString(), now), "9 min");
    assert.equal(formatCountdown(new Date(2026, 9, 9, 13, 5).toISOString(), now), "1 h 5 min");
    assert.equal(formatCountdown(new Date(2026, 9, 9, 11, 0).toISOString(), now), "Expired");
  });
});

const sched = (over: Partial<MedicationSchedule>): MedicationSchedule => ({
  id: "s", medicationName: "Med", dose: "1", frequency: "daily", startDate: "2026-10-01", reminderTimes: ["08:00", "20:00"], remindersEnabled: true, isActive: true, ...over,
});

describe("schedule helpers", () => {
  const now = new Date(2026, 9, 9, 12, 0);
  it("finds the next reminder, rolling to tomorrow when needed", () => {
    const r = nextReminder([sched({})], now);
    assert.equal(r?.time, "20:00");
    const r2 = nextReminder([sched({ reminderTimes: ["08:00"] })], now);
    assert.equal(r2?.at.getDate(), 10);
  });
  it("ignores inactive, disabled, ended and malformed schedules", () => {
    assert.equal(nextReminder([sched({ isActive: false }), sched({ remindersEnabled: false }), sched({ endDate: "2026-10-01" }), sched({ reminderTimes: ["bad"] })], now), null);
  });
  it("lists distinct enabled times sorted", () => {
    assert.deepEqual(enabledReminderTimes([sched({}), sched({ reminderTimes: ["20:00", "06:30"] }), sched({ remindersEnabled: false, reminderTimes: ["01:00"] })]), ["06:30", "08:00", "20:00"]);
  });
});

describe("appointments", () => {
  const now = new Date(2026, 9, 9, 12, 0);
  const appt = (id: string, status: Appointment["status"], startsAt: string): Appointment => ({ id, slotId: id, status, slot: { startsAt, endsAt: startsAt } });
  it("picks the earliest upcoming confirmed appointment", () => {
    const list = [
      appt("past", "confirmed", new Date(2026, 9, 8).toISOString()),
      appt("cancelled", "cancelled", new Date(2026, 9, 9, 13).toISOString()),
      appt("later", "confirmed", new Date(2026, 9, 12).toISOString()),
      appt("soon", "confirmed", new Date(2026, 9, 10).toISOString()),
    ];
    assert.equal(nextAppointment(list, now)?.id, "soon");
    assert.equal(nextAppointment([], now), null);
  });
});

describe("error descriptions", () => {
  it("never echoes a raw server message for 5xx and offers retry for network errors", () => {
    const server = describeError(new ApiError({ code: "INTERNAL_ERROR", message: "SELECT * FROM secrets", status: 500, requestId: "r" }));
    assert.ok(!server.detail.includes("SELECT"));
    assert.equal(server.retryable, true);
    assert.equal(describeError(new ApiError({ code: "NETWORK_ERROR", message: "x", status: 0 })).retryable, true);
    assert.equal(describeError(new ApiError({ code: "PROVIDER_DISABLED", message: "x", status: 503 })).retryable, false);
    assert.equal(describeError(new ApiError({ code: "FORBIDDEN", message: "x", status: 403 })).title, "No access");
  });
});
