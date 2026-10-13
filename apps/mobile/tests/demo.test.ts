import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { appointmentApi, authApi, hospitalApi, medicationApi, patientApi, prescriptionApi, qrApi } from "../src/api/endpoints.ts";
import { isApiError } from "../src/api/errors.ts";
import { configureHttp, request } from "../src/api/http.ts";
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

  it("corrections add a version, are labelled patient_corrected, and carry confidence forward", async () => {
    await signIn();
    const before = await prescriptionApi.get("demo-rx-1");
    const med0 = before.medications[0];
    assert.ok(med0);
    const updated = await prescriptionApi.correct("demo-rx-1", {
      prescriptionDate: before.prescriptionDate,
      prescriberName: before.prescriberName,
      medications: before.medications.map(({ confidence: _c, ...m }, i) => (i === 1 ? { ...m, dose: "1 tablet", frequency: "once a day" } : m)),
    });
    assert.equal(updated.verificationStatus, "patient_corrected");
    assert.equal(updated.medications[1]?.confidence, 0.62); // correction never makes a read "confident"
    const versions = await prescriptionApi.versions("demo-rx-1");
    assert.equal(versions.items.length, 2);
    assert.equal(versions.items[0]?.kind, "patient_correction");
    await rejectsWith(request("/prescriptions/demo-rx-1/extracted-fields", { method: "PATCH", json: { medications: [], hack: 1 } }), "VALIDATION_ERROR");
  });
});

describe("demo medication schedules (server-side gate)", () => {
  it("refuses a schedule for a prescription that needs review, even for a complete medicine", async () => {
    await signIn();
    await rejectsWith(medicationApi.create({ prescriptionId: "demo-rx-1", medicationIndex: 0, startDate: "2026-10-13", timezone: "Asia/Kolkata" }), "CONFLICT");
    await rejectsWith(medicationApi.create({ prescriptionId: "demo-rx-1", medicationIndex: 1, startDate: "2026-10-13", timezone: "Asia/Kolkata" }), "CONFLICT");
  });

  it("creates a schedule from a complete, confident medicine and records self-reported doses", async () => {
    await signIn();
    const s = await medicationApi.create({ prescriptionId: "demo-rx-2", medicationIndex: 0, startDate: "2026-10-13", timezone: "Asia/Kolkata" });
    assert.equal(s.medicationName, "Mockapril");
    assert.deepEqual(s.reminderTimes, ["08:00"]);
    await rejectsWith(medicationApi.create({ prescriptionId: "demo-rx-2", medicationIndex: 9, startDate: "2026-10-13", timezone: "Asia/Kolkata" }), "NOT_FOUND");
    const dose = await medicationApi.reportDose(s.id, { scheduledFor: new Date().toISOString(), status: "taken" });
    assert.equal(dose.selfReported, true);
    await rejectsWith(medicationApi.reportDose(s.id, { scheduledFor: "not a date", status: "taken" }), "VALIDATION_ERROR");
    const edited = await medicationApi.update(s.id, { reminderTimes: ["09:30", "21:00"], remindersEnabled: true });
    assert.deepEqual(edited.reminderTimes, ["09:30", "21:00"]);
    await rejectsWith(medicationApi.update(s.id, { reminderTimes: ["9:30"] }), "VALIDATION_ERROR");
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

  it("QR sessions carry a random reference, never medical data, and are audited", async () => {
    await signIn();
    const session = await qrApi.createSession({ prescriptionId: "demo-rx-2" });
    assert.ok(session.reference?.startsWith("healthhub://demo-qr/"));
    assert.ok(!JSON.stringify(session).toLowerCase().includes("mockapril"));
    assert.equal((await qrApi.getSession(session.id)).status, "active");
    await rejectsWith(qrApi.createSession({ prescriptionId: "nope" }), "VALIDATION_ERROR");
    await rejectsWith(qrApi.getSession("missing"), "NOT_FOUND");
    const history = await patientApi.accessHistory();
    assert.ok(history.items.some((e) => e.action === "consent.created"));
  });
});
