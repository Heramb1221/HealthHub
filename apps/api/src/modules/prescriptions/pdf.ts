import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { buildPrescriptionPdf } from "../../pdf/prescriptionPdf.js";
import { recordAudit } from "../audit/audit.js";
import { getLatestVersion } from "./versions.js";

export const prescriptionReference = (env: Pick<Env, "QR_LINK_BASE">, prescriptionId: string): string =>
  `${env.QR_LINK_BASE}prescription/${prescriptionId}`;

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
    select: {
      sourceType: true,
      patient: {
        select: {
          healthId: true,
          fullName: true,
          dateOfBirth: true,
          gender: true,
          phone: true,
        },
      },
    },
  });
  const version = await getLatestVersion(db, prescriptionId);

  const bytes = buildPrescriptionPdf({
    healthId: record.patient.healthId,
    prescriptionId,
    sourceType: record.sourceType,
    patientName: record.patient.fullName,
    patientGender: record.patient.gender,
    patientDob: record.patient.dateOfBirth ? record.patient.dateOfBirth.toISOString().slice(0, 10) : null,
    patientPhone: record.patient.phone,
    hospitalName: "Apollo Multi-Specialty Hospital & Diagnostics",
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

  return { bytes, filename: `sehatmed-prescription-${prescriptionId.slice(0, 8)}.pdf` };
}
