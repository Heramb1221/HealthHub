import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { buildPrescriptionPdf } from "../../pdf/prescriptionPdf.js";
import { recordAudit } from "../audit/audit.js";
import { getLatestVersion } from "./versions.js";

/** QR payload for a record: the configured base plus the record's random id. No medical data. */
export const prescriptionReference = (env: Pick<Env, "QR_LINK_BASE">, prescriptionId: string): string =>
  `${env.QR_LINK_BASE}prescription/${prescriptionId}`;

/**
 * Renders the downloadable record from the latest version. Call only after the
 * access guard has confirmed the caller is the owning patient. Throws NOT_FOUND
 * if nothing has been extracted or entered yet, because a PDF of an empty
 * record would suggest there is nothing to check.
 */
export async function generatePrescriptionPdf(
  deps: { db: Db; env: Pick<Env, "QR_LINK_BASE"> },
  auth: AuthContext,
  target: { prescriptionId: string; patientId: string },
  ctx: { requestId: string },
  now: Date = new Date(),
): Promise<{ bytes: Buffer; filename: string }> {
  const { db, env } = deps;
  const { prescriptionId, patientId } = target;

  const record = await db.prescriptionRecord.findUniqueOrThrow({
    where: { id: prescriptionId },
    select: { sourceType: true, patient: { select: { healthId: true } } },
  });
  const version = await getLatestVersion(db, prescriptionId);

  const bytes = buildPrescriptionPdf({
    healthId: record.patient.healthId,
    prescriptionId,
    sourceType: record.sourceType,
    version,
    qrPayload: prescriptionReference(env, prescriptionId),
    generatedAt: now,
  });

  await recordAudit(db, {
    action: "prescription.pdf_downloaded",
    outcome: "success",
    actorUserId: auth.userId,
    patientId,
    resourceType: "prescription",
    resourceId: prescriptionId,
    requestId: ctx.requestId,
    metadata: { versionNumber: version.versionNumber },
  });

  // The file name is generated from the id only: no patient name or other personal data.
  return { bytes, filename: `healthhub-prescription-${prescriptionId.slice(0, 8)}.pdf` };
}
