import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TEST_DATABASE_URL,
  closeHarness,
  makePatient,
  makePrescription,
  makeSlot,
  openHarness,
  sqlState,
  uniq,
  type Harness,
} from "./helpers.js";

// Skipped (and reported as skipped) when no test database is configured.
describe.skipIf(!TEST_DATABASE_URL)("database schema integrity", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await openHarness(TEST_DATABASE_URL as string);
  });
  afterAll(async () => {
    await closeHarness(h);
  });

  it("applies all migrations to an empty database", async () => {
    const tables = await h.pg.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1",
    );
    expect(tables.rows.map((r) => r.table_name)).toEqual([
      "Appointment",
      "AuditEvent",
      "AvailabilitySlot",
      "Consent",
      "Hospital",
      "MedicationSchedule",
      "Patient",
      "PrescriptionMedication",
      "PrescriptionRecord",
      "PrescriptionVersion",
      "Session",
      "User",
    ]);
  });

  describe("identity", () => {
    it("rejects a duplicate healthId", async () => {
      const a = await makePatient(h.db);
      const b = await h.db.user.create({ data: { email: `${uniq("u")}@example.test`, passwordHash: "x" } });
      await expect(h.db.patient.create({ data: { userId: b.id, healthId: a.patient.healthId } })).rejects.toMatchObject({
        code: "P2002",
      });
    });

    it("rejects a second patient row for one user", async () => {
      const a = await makePatient(h.db);
      await expect(h.db.patient.create({ data: { userId: a.user.id, healthId: uniq("HID") } })).rejects.toMatchObject({
        code: "P2002",
      });
    });

    it("rejects duplicate and non-lowercase emails", async () => {
      const email = `${uniq("dup")}@example.test`;
      await h.db.user.create({ data: { email, passwordHash: "x" } });
      await expect(h.db.user.create({ data: { email, passwordHash: "x" } })).rejects.toMatchObject({ code: "P2002" });
      expect(
        await sqlState(
          h.pg.query(`INSERT INTO "User"("email","passwordHash","updatedAt") VALUES ($1,'x',now())`, [
            `${uniq("Upper")}@Example.test`,
          ]),
        ),
      ).toBe("23514");
    });
  });

  describe("consent", () => {
    it("accepts a known scope and rejects an unknown one", async () => {
      const { patient } = await makePatient(h.db);
      const { user: provider } = await makePatient(h.db, "provider");
      const ok = await h.db.consent.create({
        data: { patientId: patient.id, granteeUserId: provider.id, resourceScope: "prescriptions:read", purpose: "demo" },
      });
      expect(ok.revokedAt).toBeNull();
      await expect(
        h.db.consent.create({
          data: { patientId: patient.id, granteeUserId: provider.id, resourceScope: "everything:write", purpose: "demo" },
        }),
      ).rejects.toBeDefined();
    });

    it("rejects a consent for a patient that does not exist", async () => {
      const { user: provider } = await makePatient(h.db, "provider");
      expect(
        await sqlState(
          h.pg.query(
            `INSERT INTO "Consent"("patientId","granteeUserId","resourceScope","purpose")
             VALUES (gen_random_uuid(), $1, 'profile:read', 'demo')`,
            [provider.id],
          ),
        ),
      ).toBe("23503");
    });
  });

  describe("audit log", () => {
    it("is append-only: update, delete, and truncate are blocked", async () => {
      const { user, patient } = await makePatient(h.db);
      const event = await h.db.auditEvent.create({
        data: { actorUserId: user.id, patientId: patient.id, action: "test.event", outcome: "success" },
      });
      expect(await sqlState(h.pg.query(`UPDATE "AuditEvent" SET "action" = 'tampered' WHERE "id" = $1`, [event.id]))).toBe("55000");
      expect(await sqlState(h.pg.query(`DELETE FROM "AuditEvent" WHERE "id" = $1`, [event.id]))).toBe("55000");
      expect(await sqlState(h.pg.query(`TRUNCATE "AuditEvent"`))).toBe("55000");
      const stored = await h.db.auditEvent.findUniqueOrThrow({ where: { id: event.id } });
      expect(stored.action).toBe("test.event");
    });
  });

  describe("prescriptions", () => {
    it("keeps versions and medications immutable and numbered uniquely", async () => {
      const { patient } = await makePatient(h.db);
      const record = await makePrescription(h.db, patient.id);
      const v1 = await h.db.prescriptionVersion.create({
        data: {
          prescriptionId: record.id,
          versionNumber: 1,
          kind: "extraction",
          verificationStatus: "needs_review",
          extractionProvider: "mock",
          extractionConfidence: 0.42,
          medications: { create: [{ position: 0, name: "Synthetic-Med", confidence: 0.4 }] },
        },
        include: { medications: true },
      });

      await expect(
        h.db.prescriptionVersion.create({
          data: { prescriptionId: record.id, versionNumber: 1, kind: "patient_correction", verificationStatus: "patient_corrected" },
        }),
      ).rejects.toMatchObject({ code: "P2002" });

      expect(await sqlState(h.pg.query(`UPDATE "PrescriptionVersion" SET "prescriberName" = 'x' WHERE "id" = $1`, [v1.id]))).toBe("55000");
      expect(await sqlState(h.pg.query(`DELETE FROM "PrescriptionVersion" WHERE "id" = $1`, [v1.id]))).toBe("55000");
      const med = v1.medications[0];
      expect(await sqlState(h.pg.query(`UPDATE "PrescriptionMedication" SET "dose" = '999' WHERE "id" = $1`, [med?.id]))).toBe("55000");
      expect(await sqlState(h.pg.query(`DELETE FROM "PrescriptionMedication" WHERE "id" = $1`, [med?.id]))).toBe("55000");
    });

    it("rejects out-of-range confidence", async () => {
      const { patient } = await makePatient(h.db);
      const record = await makePrescription(h.db, patient.id);
      await expect(
        h.db.prescriptionVersion.create({
          data: { prescriptionId: record.id, versionNumber: 1, kind: "extraction", verificationStatus: "unverified", extractionConfidence: 1.5 },
        }),
      ).rejects.toBeDefined();
      const v = await h.db.prescriptionVersion.create({
        data: { prescriptionId: record.id, versionNumber: 1, kind: "extraction", verificationStatus: "unverified" },
      });
      await expect(
        h.db.prescriptionMedication.create({ data: { versionId: v.id, position: 0, confidence: -0.1 } }),
      ).rejects.toBeDefined();
    });

    it("lets processing status change but never the original file reference", async () => {
      const { patient } = await makePatient(h.db);
      const record = await makePrescription(h.db, patient.id);
      const updated = await h.db.prescriptionRecord.update({ where: { id: record.id }, data: { processingStatus: "completed" } });
      expect(updated.processingStatus).toBe("completed");
      expect(
        await sqlState(h.pg.query(`UPDATE "PrescriptionRecord" SET "originalStorageKey" = 'other' WHERE "id" = $1`, [record.id])),
      ).toBe("55000");
      expect(
        await sqlState(h.pg.query(`UPDATE "PrescriptionRecord" SET "originalSha256" = 'other' WHERE "id" = $1`, [record.id])),
      ).toBe("55000");
    });
  });

  describe("appointment booking", () => {
    it("allows exactly one confirmed booking per slot under concurrency", async () => {
      const { slot } = await makeSlot(h.db);
      const patients = await Promise.all(Array.from({ length: 10 }, () => makePatient(h.db)));

      const results = await Promise.allSettled(
        patients.map(({ patient }) =>
          h.db.appointment.create({ data: { patientId: patient.id, slotId: slot.id, activeSlotId: slot.id } }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(9);
      for (const r of rejected) expect(r.reason).toMatchObject({ code: "P2002" });
      const confirmed = await h.db.appointment.count({ where: { slotId: slot.id, status: "confirmed" } });
      expect(confirmed).toBe(1);
    });

    it("frees the slot when an appointment is cancelled", async () => {
      const { slot } = await makeSlot(h.db);
      const [a, b] = await Promise.all([makePatient(h.db), makePatient(h.db)]);
      const first = await h.db.appointment.create({ data: { patientId: a.patient.id, slotId: slot.id, activeSlotId: slot.id } });
      await h.db.appointment.update({
        where: { id: first.id },
        data: { status: "cancelled", activeSlotId: null, cancelledAt: new Date() },
      });
      const second = await h.db.appointment.create({ data: { patientId: b.patient.id, slotId: slot.id, activeSlotId: slot.id } });
      expect(second.status).toBe("confirmed");
    });

    it("rejects state combinations that would break the invariant", async () => {
      const { slot } = await makeSlot(h.db);
      const { patient } = await makePatient(h.db);
      // confirmed without holding the slot
      await expect(h.db.appointment.create({ data: { patientId: patient.id, slotId: slot.id } })).rejects.toBeDefined();
      // cancelled while still holding the slot
      await expect(
        h.db.appointment.create({ data: { patientId: patient.id, slotId: slot.id, status: "cancelled", activeSlotId: slot.id } }),
      ).rejects.toBeDefined();
    });

    it("rejects a slot that ends before it starts and duplicate slot times", async () => {
      const { hospital, slot } = await makeSlot(h.db);
      await expect(
        h.db.availabilitySlot.create({
          data: { hospitalId: hospital.id, startsAt: new Date("2030-01-01T10:00:00Z"), endsAt: new Date("2030-01-01T09:00:00Z") },
        }),
      ).rejects.toBeDefined();
      await expect(
        h.db.availabilitySlot.create({ data: { hospitalId: hospital.id, startsAt: slot.startsAt, endsAt: slot.endsAt } }),
      ).rejects.toMatchObject({ code: "P2002" });
    });
  });
});
