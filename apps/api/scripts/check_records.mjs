import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: "postgresql://postgres:Heramb%401221@localhost:5433/healthhub" });
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

async function check() {
  const rxs = await db.prescriptionRecord.findMany({
    orderBy: { createdAt: "desc" },
    include: { versions: { include: { medications: true } } }
  });
  console.log("Prescriptions count:", rxs.length);
  for (const rx of rxs) {
    console.log("RX:", rx.id, "patientId:", rx.patientId, "status:", rx.processingStatus);
    for (const v of rx.versions) {
      console.log("  Version:", v.versionNumber, "kind:", v.kind, "status:", v.verificationStatus, "date:", v.prescriptionDate, "doctor:", v.prescriberName);
      console.log("  Meds:", v.medications.map(m => `${m.name} (${m.frequency})`));
    }
  }
  const schedules = await db.medicationSchedule.findMany();
  console.log("MedicationSchedules count:", schedules.length);
  for (const s of schedules) {
    console.log("Schedule:", s.id, s.medicationName, s.reminderTimes, s.frequency);
  }

  const history = await db.healthHistoryEntry.findMany();
  console.log("HealthHistoryEntries count:", history.length);
  for (const h of history) {
    console.log("History:", h.id, h.title, h.source);
  }

  await pool.end();
  await db.$disconnect();
}

check().catch(console.error);
