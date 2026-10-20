import { createDb } from "../src/db/client.js";
import { loadEnv } from "../src/config/env.js";
import { inferReminderTimes } from "../src/modules/prescriptions/processing.js";

async function main() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);

  const completed = await db.prescriptionRecord.findMany({
    where: { processingStatus: "completed" },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: { medications: true },
      },
    },
  });

  console.log(`Found ${completed.length} completed prescriptions to check.`);

  for (const rx of completed) {
    const latest = rx.versions[0];
    if (!latest) continue;

    console.log(`Processing RX ${rx.id} (Patient: ${rx.patientId}), Doctor: ${latest.prescriberName}`);

    for (const med of latest.medications) {
      if (!med.name) continue;

      const existing = await db.medicationSchedule.findFirst({
        where: {
          patientId: rx.patientId,
          isActive: true,
          medicationName: { equals: med.name, mode: "insensitive" },
        },
      });

      if (!existing) {
        const times = inferReminderTimes(med.frequency);
        const created = await db.medicationSchedule.create({
          data: {
            patientId: rx.patientId,
            sourceMedicationId: med.id,
            medicationName: med.name,
            strength: med.strength ?? "",
            dose: med.dose ?? "1 dose",
            route: med.route,
            frequency: med.frequency ?? "As prescribed",
            duration: med.duration,
            instructions: med.instructions,
            startDate: new Date(),
            reminderTimes: times,
            remindersEnabled: true,
            timezone: "Asia/Kolkata",
            isActive: true,
          },
        });
        console.log(`  Created schedule for ${med.name}: times = ${times.join(", ")}`);
      } else {
        console.log(`  Schedule already exists for ${med.name}`);
      }
    }

    const doctorTitle = latest.prescriberName
      ? `Prescription: Dr. ${latest.prescriberName.replace(/^Dr\.?\s*/i, "")}`
      : "Prescription Consultation";

    const existingHistory = await db.healthHistoryEntry.findFirst({
      where: {
        patientId: rx.patientId,
        title: doctorTitle,
      },
    });

    if (!existingHistory) {
      const medSummary = latest.medications.map((m) => m.name).filter(Boolean).join(", ");
      await db.healthHistoryEntry.create({
        data: {
          patientId: rx.patientId,
          kind: "condition",
          title: doctorTitle,
          notes: `Prescribed medications: ${medSummary || "Medicines listed"}. Recorded automatically from prescription.`,
          diagnosedOn: latest.prescriptionDate ?? new Date(),
          source: "patient_reported",
          verificationStatus: "unverified",
        },
      });
      console.log(`  Created history entry: ${doctorTitle}`);
    } else {
      console.log(`  History entry already exists: ${doctorTitle}`);
    }
  }

  await db.$disconnect();
}

main().catch(console.error);
