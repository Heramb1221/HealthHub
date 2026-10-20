import { createDb } from "../src/db/client.js";
import { loadEnv } from "../src/config/env.js";
import { getPrescription } from "../src/modules/prescriptions/service.js";
import { listVersions } from "../src/modules/prescriptions/versions.js";
import { checkPrescriptionContraindications } from "../src/modules/prescriptions/contraindications.js";

async function main() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL);
  const id = "182f4529-9d6d-4c3e-a17a-5a5616770589";

  try {
    const rx = await getPrescription(db, id);
    console.log("Prescription:", rx.id, rx.processingStatus, rx.medications.length);
    const versions = await listVersions(db, id, { limit: 20 });
    console.log("Versions:", versions.data.length);
    const contra = await checkPrescriptionContraindications(db, id, env);
    console.log("Contraindications hasInteractions:", contra.hasInteractions, "alerts:", contra.alerts.length);
    for (const a of contra.alerts) {
      console.log("  Alert:", a.severity, a.title);
    }
  } catch (err) {
    console.error("ERROR:", err);
  } finally {
    await db.$disconnect();
  }
}

main();
