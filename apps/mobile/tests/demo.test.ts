import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { appointmentApi, authApi, consentApi, historyApi, hospitalApi, medicationApi, patientApi, prescriptionApi, qrApi } from "../src/api/endpoints.ts";
import { isApiError } from "../src/api/errors.ts";
import { configureHttp, request } from "../src/api/http.ts";
import { DEMO_ACCOUNTS } from "../src/demo/accounts.ts";
import { DEMO_BASE_URL, demoFetch, resetDemo } from "../src/demo/demoFetch.ts";

let token: string | null = null;

beforeEach(async () => {
  resetDemo();
  token = null;
  configureHttp({ baseUrl: DEMO_BASE_URL, getToken: () => token, onUnauthorized: () => {}, fetchImpl: demoFetch as typeof fetch });
});

async function signIn(): Promise<void> {
  const s = await authApi.register("tester@example.com", "long-enough-pw");
  token = s.accessToken;
}

async function rejectsWith(p: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(p, (e: unknown) => isApiError(e) && e.code === code);
}

function uploadForm(name: string): FormData {
  const f = new FormData();
  f.append("file", new Blob(["x"]), name);
  return f;
}

describe("demo shortcuts", () => {
  it("sign in through the same demo endpoint and give the sandbox people their synthetic names", async () => {
    for (const [id, name] of [["patient", "Asha Demo"], ["google", "Alex Chen"], ["apple", "Alex Chen"]] as const) {
      resetDemo();
      const a = DEMO_ACCOUNTS[id];
      const session = await authApi.login(a.email, a.password);
      token = session.accessToken;
      assert.equal(session.user.role, "patient");
      assert.equal((await patientApi.me()).fullName, name);
    }
    token = null;
    await rejectsWith(patientApi.me(), "UNAUTHENTICATED");
  });
});

describe("demo token refresh (backend L1)", () => {
  it("swaps the token: the new one works, and the old one no longer does", async () => {
    await signIn();
    const old = token;
    const next = await authApi.refresh();
    assert.notEqual(next.accessToken, old);
    token = old;
    await rejectsWith(patientApi.me(), "UNAUTHENTICATED");
    token = next.accessToken;
    assert.equal((await patientApi.me()).healthId.startsWith("HH-"), true);
  });
});

describe("demo auth", () => {
  it("validates credentials like the backend and requires a token elsewhere", async () => {
    await rejectsWith(authApi.register("a@b.co", "short"), "VALIDATION_ERROR");
    await rejectsWith(patientApi.me(), "UNAUTHENTICATED");
    const s = await authApi.register("tester@example.com", "long-enough-pw");
    assert.equal(s.user.role, "patient");
    await rejectsWith(authApi.register("tester@example.com", "long-enough-pw"), "CONFLICT");
  });

  it("logout revokes the token", async () => {
    await signIn();
    await authApi.logout();
    await rejectsWith(patientApi.me(), "UNAUTHENTICATED");
  });
});

describe("demo patient rules (backend G2/G3/G6)", () => {
  it("rejects unknown/forbidden fields, empty bodies and bad enums", async () => {
    await signIn();
    await rejectsWith(request("/patients/me", { method: "PATCH", json: { healthId: "HH-X" } }), "VALIDATION_ERROR");
    await rejectsWith(request("/patients/me", { method: "PATCH", json: {} }), "VALIDATION_ERROR");
    await rejectsWith(request("/patients/me", { method: "PATCH", json: { gender: "robot" } }), "VALIDATION_ERROR");
    await rejectsWith(request("/patients/me", { method: "PATCH", json: { dateOfBirth: "2999-01-01" } }), "VALIDATION_ERROR");
  });

  it("merges emergencyContact, clears with null and de-duplicates lists", async () => {
    await signIn();
    const p = await patientApi.update({ emergencyContact: { name: "New Name" }, allergies: ["Dust", "dust", "Pollen"], address: null });
    assert.equal(p.emergencyContact.name, "New Name");
    assert.equal(p.emergencyContact.phone, "+91 90000 00001");
    assert.deepEqual(p.allergies, ["Dust", "Pollen"]);
    assert.equal(p.address, null);
  });

  it("health card is identity only", async () => {
    await signIn();
    const card = await patientApi.healthCard();
    assert.ok(card.healthId.startsWith("HH-"));
    assert.ok(!("allergies" in card) && !("phone" in card) && !("emergencyContact" in card));
  });
});

describe("demo prescriptions and safety gating", () => {
  it("upload is pending with no medicines; processing a clear fixture is unverified, never verified", async () => {
    await signIn();
    const created = await request<{ id: string; processingStatus: string; medications: unknown[]; verificationStatus: string }>("/prescriptions", { method: "POST", formData: uploadForm("IMG_001.jpg") });
    assert.equal(created.processingStatus, "pending");
    assert.deepEqual(created.medications, []);
    const done = await prescriptionApi.process(created.id);
    assert.equal(done.processingStatus, "completed");
    assert.equal(done.verificationStatus, "unverified");
    assert.equal(done.medications.length, 1);
    await rejectsWith(prescriptionApi.process(created.id), "CONFLICT");
  });

  it("ambiguous fixtures need review and illegible ones fail without inventing data", async () => {
    await signIn();
    const a = await request<{ id: string }>("/prescriptions", { method: "POST", formData: uploadForm("demo-ambiguous.jpg") });
    assert.equal((await prescriptionApi.process(a.id)).verificationStatus, "needs_review");
    const bad = await request<{ id: string }>("/prescriptions", { method: "POST", formData: uploadForm("demo-illegible.png") });
    const failed = await prescriptionApi.process(bad.id);
    assert.equal(failed.processingStatus, "failed");
    assert.deepEqual(failed.medications, []);
    assert.equal((await prescriptionApi.process(bad.id)).processingStatus, "failed"); // retry allowed
  });

  it("an upload without a file part is refused", async () => {
    await signIn();
    await rejectsWith(request("/prescriptions", { method: "POST", formData: new FormData() }), "VALIDATION_ERROR");
  });

  it("a correction is a NEW patient_corrected version based on the version the patient saw", async () => {
    await signIn();
    const before = await prescriptionApi.get("demo-rx-1");
    assert.equal((await prescriptionApi.latest("demo-rx-1")).versionNumber, 1);
    const created = await prescriptionApi.correct("demo-rx-1", {
      baseVersionNumber: 1,
      medications: before.medications.map(({ confidence: _c, ...m }, i) => (i === 1 ? { ...m, dose: "1 tablet", frequency: "once a day" } : m)),
    });
    assert.equal(created.versionNumber, 2);
    assert.equal(created.kind, "patient_correction");
    assert.equal(created.verificationStatus, "patient_corrected"); // the patient's own entry, never clinician verification
    assert.deepEqual(created.changedFields, ["medications.1.dose", "medications.1.frequency"]); // names only
    assert.equal(created.medications[0]?.confidence, 0.93); // unchanged row keeps its confidence
    assert.equal(created.medications[1]?.confidence, 1); // edited row is "stated by a person"
    assert.equal((await prescriptionApi.get("demo-rx-1")).verificationStatus, "patient_corrected");
    const versions = await prescriptionApi.versions("demo-rx-1");
    assert.equal(versions.items.length, 2);
    assert.equal(versions.items[0]?.kind, "patient_correction");
  });

  it("refuses a stale base version, unknown fields, and status fields", async () => {
    await signIn();
    await rejectsWith(prescriptionApi.correct("demo-rx-1", { baseVersionNumber: 0, prescriberName: "Dr. X" }), "CONFLICT");
    await rejectsWith(request("/prescriptions/demo-rx-1/extracted-fields", { method: "PATCH", json: { baseVersionNumber: 1, medications: [], hack: 1 } }), "VALIDATION_ERROR");
    await rejectsWith(request("/prescriptions/demo-rx-1/extracted-fields", { method: "PATCH", json: { baseVersionNumber: 1, verificationStatus: "verified_by_authorized_clinician" } }), "VALIDATION_ERROR");
    await rejectsWith(request("/prescriptions/demo-rx-1/extracted-fields", { method: "PATCH", json: { baseVersionNumber: 1 } }), "VALIDATION_ERROR");
    await rejectsWith(prescriptionApi.correct("demo-rx-1", { baseVersionNumber: 1, prescriptionDate: "2999-01-01" }), "VALIDATION_ERROR");
  });

  it("a patient can enter details by hand for an illegible upload, and automatic reading is then refused", async () => {
    await signIn();
    const bad = await request<{ id: string }>("/prescriptions", { method: "POST", formData: uploadForm("demo-illegible.png") });
    await prescriptionApi.process(bad.id);
    await rejectsWith(prescriptionApi.latest(bad.id), "NOT_FOUND");
    const v = await prescriptionApi.correct(bad.id, { baseVersionNumber: 0, medications: [{ name: "Entered by me", strength: "5 mg", dose: "1 tablet", route: null, frequency: "once a day", duration: null, instructions: null }] });
    assert.equal(v.versionNumber, 1);
    assert.equal(v.medications[0]?.confidence, 1);
    await rejectsWith(prescriptionApi.process(bad.id), "CONFLICT");
  });

  it("'confirmed' raises an unchanged low-confidence row to confidence 1", async () => {
    await signIn();
    const rx = await prescriptionApi.get("demo-rx-2");
    const v = await prescriptionApi.correct("demo-rx-2", { baseVersionNumber: 1, medications: rx.medications.map(({ confidence: _c, ...m }) => ({ ...m, confirmed: true })) });
    assert.equal(v.medications[0]?.confidence, 1);
    assert.deepEqual(v.changedFields, ["medications.0.confirmed"]);
  });
});

describe("demo medication schedules (backend K gate)", () => {
  const base = { startDate: new Date().toISOString().slice(0, 10), timezone: "Asia/Kolkata" };

  it("refuses a schedule until a person has reviewed the version, even for a complete confident medicine", async () => {
    await signIn();
    await rejectsWith(medicationApi.create({ prescriptionId: "demo-rx-2", versionNumber: 1, medicationPosition: 0, ...base }), "CONFLICT"); // unverified
    await rejectsWith(medicationApi.create({ prescriptionId: "demo-rx-1", versionNumber: 1, medicationPosition: 0, ...base }), "CONFLICT"); // needs_review
  });

  it("after review: refuses stale versions, incomplete rows and duplicates; creates a labelled copy", async () => {
    await signIn();
    const rx = await prescriptionApi.get("demo-rx-1");
    const v2 = await prescriptionApi.correct("demo-rx-1", { baseVersionNumber: 1, medications: rx.medications.map(({ confidence: _c, ...m }) => m) });
    assert.equal(v2.medications[1]?.confidence, 0.62); // untouched, unreadable row stays low confidence
    await rejectsWith(medicationApi.create({ prescriptionId: "demo-rx-1", versionNumber: 1, medicationPosition: 0, ...base }), "CONFLICT"); // stale
    await rejectsWith(medicationApi.create({ prescriptionId: "demo-rx-1", versionNumber: 2, medicationPosition: 1, ...base }), "CONFLICT"); // incomplete
    await rejectsWith(medicationApi.create({ prescriptionId: "demo-rx-1", versionNumber: 2, medicationPosition: 9, ...base }), "NOT_FOUND");
    const s = await medicationApi.create({ prescriptionId: "demo-rx-1", versionNumber: 2, medicationPosition: 0, ...base });
    assert.equal(s.medication.name, "Examplin");
    assert.equal(s.sourceStatus, "current");
    assert.equal(s.remindersEnabled, false);
    assert.match(s.notice, /not medical advice/i);
    await rejectsWith(medicationApi.create({ prescriptionId: "demo-rx-1", versionNumber: 2, medicationPosition: 0, ...base }), "CONFLICT"); // duplicate
    await rejectsWith(request("/medication-schedules", { method: "POST", json: { prescriptionId: "demo-rx-1", versionNumber: 2, medicationPosition: 0, ...base, dose: "10 tablets" } }), "VALIDATION_ERROR");
  });

  it("a confirmed row can be scheduled; reminders need times; doses are self-reported and not repeatable", async () => {
    await signIn();
    const rx = await prescriptionApi.get("demo-rx-1");
    await prescriptionApi.correct("demo-rx-1", {
      baseVersionNumber: 1,
      medications: rx.medications.map(({ confidence: _c, ...m }, i) => (i === 1 ? { ...m, dose: "1 tablet", frequency: "once a day", confirmed: true } : m)),
    });
    const s = await medicationApi.create({ prescriptionId: "demo-rx-1", versionNumber: 2, medicationPosition: 1, ...base });
    await rejectsWith(medicationApi.update(s.id, { remindersEnabled: true }), "VALIDATION_ERROR"); // no times
    const edited = await medicationApi.update(s.id, { reminderTimes: ["21:00", "09:30", "21:00"], remindersEnabled: true });
    assert.deepEqual(edited.reminderTimes, ["09:30", "21:00"]); // sorted, de-duplicated
    assert.equal(edited.remindersActive, true);
    await rejectsWith(medicationApi.update(s.id, { reminderTimes: ["9:30"] }), "VALIDATION_ERROR");
    await rejectsWith(request(`/medication-schedules/${s.id}`, { method: "PATCH", json: { dose: "2" } }), "VALIDATION_ERROR"); // text is not editable
    const at = new Date().toISOString();
    const dose = await medicationApi.reportDose(s.id, { scheduledFor: at, status: "taken" });
    assert.equal(dose.selfReported, true);
    await rejectsWith(medicationApi.reportDose(s.id, { scheduledFor: at, status: "skipped" }), "CONFLICT");
    await rejectsWith(medicationApi.reportDose(s.id, { scheduledFor: "not a date", status: "taken" }), "VALIDATION_ERROR");
    await rejectsWith(medicationApi.reportDose(s.id, { scheduledFor: new Date(Date.now() + 5 * 3_600_000).toISOString(), status: "taken" }), "VALIDATION_ERROR");
    const listed = (await medicationApi.list()).items.find((x) => x.id === s.id);
    assert.equal(listed?.recentDoseEvents.length, 1);
    assert.equal(listed?.recentDoseEvents[0]?.status, "taken");
    const stopped = await medicationApi.update(s.id, { isActive: false });
    assert.equal(stopped.remindersActive, false);
    await rejectsWith(medicationApi.reportDose(s.id, { scheduledFor: new Date().toISOString(), status: "taken" }), "CONFLICT");
  });

  it("flags a schedule when the prescription is later corrected differently", async () => {
    await signIn();
    const rx = await prescriptionApi.get("demo-rx-2");
    await prescriptionApi.correct("demo-rx-2", { baseVersionNumber: 1, medications: rx.medications.map(({ confidence: _c, ...m }) => ({ ...m, confirmed: true })) });
    const s = await medicationApi.create({ prescriptionId: "demo-rx-2", versionNumber: 2, medicationPosition: 0, ...base, reminderTimes: ["08:00"], remindersEnabled: true });
    assert.equal(s.remindersActive, true);
    await prescriptionApi.correct("demo-rx-2", { baseVersionNumber: 2, medications: rx.medications.map(({ confidence: _c, ...m }) => ({ ...m, dose: "2 tablets" })) });
    const after = (await medicationApi.list()).items.find((x) => x.id === s.id);
    assert.equal(after?.sourceStatus, "changed");
    assert.equal(after?.remindersActive, false); // reminders pause; the schedule keeps the text it was made from
    assert.equal(after?.medication.dose, "1 tablet");
  });
});

describe("demo health history (backend L5)", () => {
  it("adds patient-reported, unverified entries and refuses bad input", async () => {
    await signIn();
    const e = await historyApi.addCondition({ title: "Asthma (demo)", notes: "Mild", diagnosedOn: "2020-05-01" });
    assert.equal(e.source, "patient_reported");
    assert.equal(e.verificationStatus, "unverified");
    assert.equal(e.diagnosedOn, "2020-05-01");
    assert.equal((await historyApi.list()).items[0]?.id, e.id);
    await rejectsWith(historyApi.addCondition({ title: "  " }), "VALIDATION_ERROR");
    await rejectsWith(historyApi.addCondition({ title: "X", diagnosedOn: "2999-01-01" }), "VALIDATION_ERROR");
    await rejectsWith(request("/health-history/conditions", { method: "POST", json: { name: "old field" } }), "VALIDATION_ERROR");
  });
});

describe("demo hospitals, booking and QR", () => {
  it("prevents double booking and reopens a slot on cancel", async () => {
    await signIn();
    const hospitals = await hospitalApi.list();
    assert.ok(hospitals.items.every((h) => h.isDemo));
    const slots = await hospitalApi.availability("demo-h1");
    const slot = slots.items.find((s) => s.status === "open");
    assert.ok(slot);
    const appt = await appointmentApi.book({ slotId: slot.id });
    assert.equal(appt.status, "confirmed");
    await rejectsWith(appointmentApi.book({ slotId: slot.id }), "CONFLICT");
    await appointmentApi.cancel(appt.id);
    assert.equal((await hospitalApi.availability("demo-h1")).items.find((s) => s.id === slot.id)?.status, "open");
    await rejectsWith(request("/appointments", { method: "POST", json: { slotId: slot.id, patientId: "x" } }), "VALIDATION_ERROR");
  });

  it("QR sessions carry a random link, never medical data; they expire on revoke and are audited", async () => {
    await signIn();
    const session = await qrApi.createSession({ prescriptionId: "demo-rx-2" });
    assert.ok(session.qrPayload.startsWith("healthhub://qr/"));
    assert.equal(session.revokedAt, null);
    assert.ok(!JSON.stringify(session).toLowerCase().includes("mockapril"));
    const lookup = await qrApi.getSession(session.id);
    assert.equal(lookup.prescription.id, "demo-rx-2");
    assert.equal("patient" in lookup, false); // no profile data
    await rejectsWith(qrApi.createSession({ prescriptionId: "nope" }), "NOT_FOUND");
    await rejectsWith(qrApi.getSession("missing"), "NOT_FOUND");
    const revoked = await qrApi.revokeSession(session.id);
    assert.ok(revoked.revokedAt);
    assert.equal((await qrApi.revokeSession(session.id)).revokedAt, revoked.revokedAt); // repeating changes nothing
    await rejectsWith(qrApi.getSession(session.id), "NOT_FOUND"); // revoked looks like it never existed
    const actions = (await patientApi.accessHistory()).items.map((e) => e.action);
    assert.ok(actions.includes("qr.session_created") && actions.includes("qr.session_revoked"));
  });

  it("appointments are flat, refuse overlapping bookings, and cancelling is idempotent", async () => {
    await signIn();
    const slots = (await hospitalApi.availability("demo-h1")).items;
    const first = slots[0];
    assert.ok(first);
    const appt = await appointmentApi.book({ slotId: first.id });
    assert.equal(appt.hospital?.isDemo, true);
    assert.equal(appt.startsAt, first.startsAt);
    // The same time at another hospital overlaps the patient's own appointment.
    const other = (await hospitalApi.availability("demo-h2")).items.find((s) => s.startsAt === first.startsAt);
    assert.ok(other);
    await rejectsWith(appointmentApi.book({ slotId: other.id }), "CONFLICT");
    const cancelled = await appointmentApi.cancel(appt.id);
    assert.equal(cancelled.status, "cancelled");
    assert.ok(cancelled.cancelledAt);
    assert.equal((await appointmentApi.cancel(appt.id)).cancelledAt, cancelled.cancelledAt);
  });
});

describe("demo consents (backend F3)", () => {
  it("lists granted consents, revokes idempotently, and audits the revoke", async () => {
    await signIn();
    const before = await consentApi.list();
    assert.ok(before.items.length >= 2);
    const active = before.items.find((c) => !c.revokedAt && (!c.expiresAt || new Date(c.expiresAt) > new Date()));
    assert.ok(active);
    const revoked = await consentApi.revoke(active.id);
    assert.ok(revoked.revokedAt);
    const again = await consentApi.revoke(active.id);
    assert.equal(again.revokedAt, revoked.revokedAt); // repeating is a no-op
    const history = await patientApi.accessHistory();
    assert.equal(history.items.filter((e) => e.action === "consent.revoked").length, 1);
    await rejectsWith(consentApi.revoke("missing"), "NOT_FOUND");
  });
});
