import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, describeError } from "../src/api/errors.ts";
import type { Appointment, Consent, Hospital, MedicationSchedule, Prescription, PrescriptionMedication } from "../src/api/types.ts";
import { nextAppointment } from "../src/lib/appointments.ts";
import { formatCountdown, formatDateOnly, localTimeToIso, toDateInput } from "../src/lib/format.ts";
import { canOfferSchedule, doseLine, isInstructionSafe, medicationReviewReasons, scheduleBlock } from "../src/lib/safety.ts";
import { enabledReminderTimes, nextReminder } from "../src/lib/schedule.ts";
import { describeAccessEvent } from "../src/lib/access.ts";
import { consentStatus, providerLabel, scopeLabel, sortConsents } from "../src/lib/consents.ts";
import { filterHospitals, groupAppointments } from "../src/lib/filter.ts";
import { BLOOD_GROUPS, GENDER_OPTIONS, genderLabel } from "../src/lib/profileOptions.ts";
import { durationDays, suggestEndDate, suggestTimes } from "../src/lib/frequency.ts";
import { blankToNull, dateOfBirthProblem, isFutureDateOnly, listProblem, phoneProblem, isValidDateOnly, isValidEmail, isValidTimeOfDay, parseList, passwordProblem } from "../src/lib/validation.ts";

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

  it("only offers a schedule once a person has reviewed the version and the medicine is complete and confident", () => {
    const base: Pick<Prescription, "processingStatus" | "verificationStatus"> = { processingStatus: "completed", verificationStatus: "patient_corrected" };
    assert.equal(canOfferSchedule(base, goodMed), true);
    assert.equal(scheduleBlock({ ...base, verificationStatus: "unverified" }, goodMed), "not_reviewed");
    assert.equal(scheduleBlock({ ...base, verificationStatus: "needs_review" }, goodMed), "not_reviewed");
    assert.equal(canOfferSchedule({ ...base, verificationStatus: "verified_by_authorized_clinician" }, goodMed), true);
    assert.equal(scheduleBlock({ ...base, processingStatus: "processing" }, goodMed), "not_finished");
    assert.equal(scheduleBlock(base, { ...goodMed, dose: null }), "incomplete");
    assert.equal(scheduleBlock(base, { ...goodMed, confidence: 0.5 }), "low_confidence");
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
  id: "s", prescriptionId: "p", sourceVersionNumber: 1, sourceStatus: "current",
  medication: { name: "Med", strength: "5 mg", dose: "1", route: null, frequency: "daily", duration: null, instructions: null },
  startDate: "2026-10-01", endDate: null, reminderTimes: ["08:00", "20:00"], remindersEnabled: true, remindersActive: true, timezone: "Asia/Kolkata",
  isActive: true, recentDoseEvents: [], notice: "n", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", ...over,
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
    assert.equal(nextReminder([sched({ isActive: false }), sched({ remindersEnabled: false }), sched({ remindersActive: false }), sched({ endDate: "2026-10-01" }), sched({ reminderTimes: ["bad"] })], now), null);
  });
  it("lists distinct enabled times sorted", () => {
    assert.deepEqual(enabledReminderTimes([sched({}), sched({ reminderTimes: ["20:00", "06:30"] }), sched({ remindersEnabled: false, reminderTimes: ["01:00"] })]), ["06:30", "08:00", "20:00"]);
  });
});

describe("appointments", () => {
  const now = new Date(2026, 9, 9, 12, 0);
  const appt = (id: string, status: Appointment["status"], startsAt: string): Appointment => ({ id, slotId: id, status, hospital: { id: "h", name: "H", isDemo: true }, startsAt, endsAt: startsAt, cancelledAt: null, createdAt: startsAt });
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

describe("backend profile rules (note G3)", () => {
  it("validates phone numbers like the server", () => {
    assert.equal(phoneProblem(""), null);
    assert.equal(phoneProblem("+91 98765 43210"), null);
    assert.equal(phoneProblem("(022) 555-0100"), null);
    assert.ok(phoneProblem("123456"));
    assert.ok(phoneProblem("98765abcde"));
    assert.ok(phoneProblem("9".repeat(21)));
    assert.ok(phoneProblem("91+98765432"));
  });

  it("validates date of birth between 1900 and today", () => {
    const now = new Date(2026, 9, 13);
    assert.equal(dateOfBirthProblem("", now), null);
    assert.equal(dateOfBirthProblem("1998-04-23", now), null);
    assert.equal(dateOfBirthProblem("2026-10-13", now), null);
    assert.ok(dateOfBirthProblem("2026-10-14", now));
    assert.ok(dateOfBirthProblem("1899-12-31", now));
    assert.ok(dateOfBirthProblem("23-04-1998", now));
  });

  it("limits list size and item length", () => {
    assert.equal(listProblem(Array.from({ length: 30 }, (_, i) => `a${i}`)), null);
    assert.ok(listProblem(Array.from({ length: 31 }, (_, i) => `a${i}`)));
    assert.ok(listProblem(["x".repeat(101)]));
  });

  it("offers exactly the server's enum values", () => {
    assert.deepEqual(GENDER_OPTIONS.map((g) => g.value), ["female", "male", "other", "prefer_not_to_say"]);
    assert.deepEqual(BLOOD_GROUPS, ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
    assert.equal(genderLabel("prefer_not_to_say"), "Prefer not to say");
    assert.equal(genderLabel(null), "Not provided");
  });
});

describe("access history descriptions (note G7)", () => {
  const base = { id: "e", occurredAt: "2026-10-13T00:00:00Z" };
  it("describes known actions in plain language and never shows ids", () => {
    const granted = describeAccessEvent({ ...base, action: "access.granted", actor: { type: "provider", userId: "u-secret" }, details: { resourceScope: "prescriptions:read" } });
    assert.equal(granted.text, "A provider you authorised viewed your prescriptions.");
    assert.ok(!granted.text.includes("u-secret"));
    assert.equal(describeAccessEvent({ ...base, action: "access.denied" }).tone, "warning");
    assert.equal(describeAccessEvent({ ...base, action: "consent.revoked", details: { resourceScope: "profile:read" } }).text, "You revoked a provider's access to your profile.");
    assert.equal(describeAccessEvent({ ...base, action: "patient.profile_updated", details: { changedFields: ["phone", "address"] } }).text, "Your profile was updated (phone, address).");
  });
  it("falls back to the action name for unknown actions", () => {
    assert.equal(describeAccessEvent({ ...base, action: "something.new_thing" }).text, "something new thing");
  });
});

describe("consents", () => {
  const now = new Date(2026, 9, 14, 12, 0);
  const c = (id: string, over: Partial<Consent>): Consent => ({ id, patientId: "p", granteeUserId: "provider-user-1234", resourceScope: "prescriptions:read", purpose: "x", expiresAt: null, revokedAt: null, createdAt: "2026-10-01T00:00:00Z", ...over });

  it("is active only while neither revoked nor expired", () => {
    assert.equal(consentStatus(c("a", {}), now), "active");
    assert.equal(consentStatus(c("b", { expiresAt: new Date(2026, 9, 15).toISOString() }), now), "active");
    assert.equal(consentStatus(c("c", { expiresAt: new Date(2026, 9, 13).toISOString() }), now), "expired");
    assert.equal(consentStatus(c("d", { revokedAt: "2026-10-02T00:00:00Z", expiresAt: new Date(2026, 9, 20).toISOString() }), now), "revoked");
  });

  it("sorts active first, then expired, then revoked, newest first within a group", () => {
    const list = [
      c("revoked", { revokedAt: "2026-10-02T00:00:00Z" }),
      c("old-active", { createdAt: "2026-09-01T00:00:00Z" }),
      c("expired", { expiresAt: new Date(2026, 9, 1).toISOString() }),
      c("new-active", { createdAt: "2026-10-10T00:00:00Z" }),
    ];
    assert.deepEqual(sortConsents(list, now).map((x) => x.id), ["new-active", "old-active", "expired", "revoked"]);
  });

  it("labels scopes and never shows a full provider id", () => {
    assert.equal(scopeLabel("health_history:read"), "Your health history");
    assert.equal(scopeLabel("unknown:scope"), "unknown:scope");
    assert.equal(providerLabel("provider-user-1234"), "Provider account ending 1234");
    assert.ok(!providerLabel("provider-user-1234").includes("provider-user"));
  });
});

describe("hospital search and appointment grouping", () => {
  const h = (id: string, over: Partial<Hospital>): Hospital => ({ id, name: id, ...over });
  it("filters on name, city, address and specialty, case-insensitively", () => {
    const list = [h("Demo City Hospital", { city: "Pune", specialties: ["Cardiology"] }), h("Example Clinic", { city: "Nashik", address: "22 Test Lane", specialties: ["Family medicine"] })];
    assert.equal(filterHospitals(list, "  ").length, 2);
    assert.deepEqual(filterHospitals(list, "PUNE").map((x) => x.id), ["Demo City Hospital"]);
    assert.deepEqual(filterHospitals(list, "cardio").map((x) => x.id), ["Demo City Hospital"]);
    assert.deepEqual(filterHospitals(list, "test lane").map((x) => x.id), ["Example Clinic"]);
    assert.equal(filterHospitals(list, "zzz").length, 0);
  });

  it("groups upcoming confirmed appointments soonest first, and the rest newest first", () => {
    const now = new Date(2026, 9, 14, 12, 0);
    const a = (id: string, status: Appointment["status"], d: Date): Appointment => ({ id, slotId: id, status, hospital: { id: "h", name: "H", isDemo: true }, startsAt: d.toISOString(), endsAt: d.toISOString(), cancelledAt: null, createdAt: d.toISOString() });
    const g = groupAppointments(
      [
        a("later", "confirmed", new Date(2026, 9, 20)),
        a("soon", "confirmed", new Date(2026, 9, 15)),
        a("cancelled-future", "cancelled", new Date(2026, 9, 16)),
        a("past", "confirmed", new Date(2026, 9, 10)),
        a("older", "confirmed", new Date(2026, 9, 1)),
      ],
      now,
    );
    assert.deepEqual(g.upcoming.map((x) => x.id), ["soon", "later"]);
    assert.deepEqual(g.past.map((x) => x.id), ["cancelled-future", "past", "older"]);
  });
});

describe("frequency and duration suggestions", () => {
  it("suggests times for known frequencies and returns null for ambiguous or complex ones", () => {
    assert.deepEqual(suggestTimes("once daily"), ["09:00"]);
    assert.deepEqual(suggestTimes("twice a day"), ["08:00", "20:00"]);
    assert.deepEqual(suggestTimes("three times daily"), ["08:00", "14:00", "21:00"]);
    assert.deepEqual(suggestTimes("4 times a day"), ["07:00", "12:00", "17:00", "22:00"]);
    assert.equal(suggestTimes("every 8 hours"), null);
    assert.equal(suggestTimes("as needed"), null);
    assert.equal(suggestTimes("at bedtime"), null);
    assert.equal(suggestTimes(null), null);
  });

  it("calculates duration in days and calculates inclusive end dates", () => {
    assert.equal(durationDays("5 days"), 5);
    assert.equal(durationDays("2 weeks"), 14);
    assert.equal(durationDays("unknown"), null);
    assert.equal(durationDays(null), null);

    assert.equal(suggestEndDate("2026-10-16", "5 days"), "2026-10-20");
    assert.equal(suggestEndDate("2026-10-16", "1 day"), "2026-10-16");
    assert.equal(suggestEndDate("2026-10-16", "2 weeks"), "2026-10-29");
    assert.equal(suggestEndDate("2026-10-16", null), null);
  });
});
