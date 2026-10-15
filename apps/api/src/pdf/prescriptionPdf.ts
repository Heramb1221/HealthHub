import { PdfBuilder } from "./pdfWriter.js";
import { qrMatrix } from "./qrMatrix.js";

export interface PdfMedication {
  name: string | null;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  confidence: number;
}

export interface PrescriptionPdfInput {
  healthId: string;
  prescriptionId: string;
  sourceType: string;
  version: {
    versionNumber: number;
    kind: string;
    verificationStatus: string;
    extractionProvider: string | null;
    extractionConfidence: number | null;
    prescriptionDate: string | null;
    prescriberName: string | null;
    medications: PdfMedication[];
  };
  /** Random reference only. Never medical data. */
  qrPayload: string;
  generatedAt: Date;
}

const BANNERS: Record<string, { text: string; fill: [number, number, number] }> = {
  needs_review: {
    text: "NEEDS REVIEW. This record was read automatically and parts of it are uncertain or missing. Check every value against the original prescription before relying on it.",
    fill: [1, 0.85, 0.85],
  },
  unverified: {
    text: "UNVERIFIED. This record was read automatically and has not been checked by a person. It may contain errors. Check it against the original prescription.",
    fill: [1, 0.93, 0.78],
  },
  patient_corrected: {
    text: "CORRECTED BY PATIENT. These values were entered or confirmed by the patient. This is NOT verification by a doctor or pharmacist.",
    fill: [0.85, 0.92, 1],
  },
  verified_by_authorized_clinician: {
    text: "VERIFIED by an authorized clinician.",
    fill: [0.85, 1, 0.88],
  },
};

const SOURCE_LABEL: Record<string, string> = {
  uploaded_physical: "Uploaded physical prescription (photo or scan)",
  clinician_issued: "Issued by a clinician",
};

const STATUS_LABEL: Record<string, string> = {
  needs_review: "needs review",
  unverified: "unverified",
  patient_corrected: "corrected by patient (not clinician-verified)",
  verified_by_authorized_clinician: "verified by authorized clinician",
};

const CHECK_THRESHOLD = 0.85;
const val = (value: string | null): string => value ?? "not recorded";

/**
 * Builds the downloadable record. It prints the stored fields as they are,
 * with the source and verification labels. It never composes a dosing
 * instruction, and the QR contains only the reference in `qrPayload`.
 */
export function buildPrescriptionPdf(input: PrescriptionPdfInput): Buffer {
  const { version } = input;
  const pdf = new PdfBuilder("HealthHub prescription record");

  pdf.text("HealthHub - Prescription record", { size: 18, bold: true });
  pdf.space(4);
  const banner = BANNERS[version.verificationStatus] ?? BANNERS["unverified"];
  if (banner) pdf.banner(banner.text, banner.fill);
  pdf.space(8);

  pdf.text(`HealthHub patient ID: ${input.healthId}`, { bold: true });
  pdf.text(`Prescription record ID: ${input.prescriptionId}`, { bold: true });
  pdf.text(`Source: ${SOURCE_LABEL[input.sourceType] ?? input.sourceType}`);
  pdf.text(`Verification status: ${STATUS_LABEL[version.verificationStatus] ?? version.verificationStatus}`);
  pdf.text(`Record version: ${version.versionNumber} (${version.kind === "patient_correction" ? "patient correction" : "automatic extraction"})`);
  if (version.kind === "extraction" && version.extractionProvider) {
    const synthetic = version.extractionProvider.startsWith("mock") ? " - synthetic test extraction, not a real reading" : "";
    const confidence = version.extractionConfidence === null ? "" : `, overall reading confidence ${Math.round(version.extractionConfidence * 100)}%`;
    pdf.text(`Extraction: ${version.extractionProvider}${confidence}${synthetic}`);
  }
  pdf.rule();

  pdf.text(`Prescriber: ${val(version.prescriberName)}`);
  pdf.text(`Prescription date: ${val(version.prescriptionDate)}`);
  pdf.space(6);

  pdf.text("Medications", { size: 13, bold: true });
  if (version.medications.length === 0) {
    pdf.text("No medications recorded.");
  }
  version.medications.forEach((m, i) => {
    pdf.space(4);
    pdf.text(`${i + 1}. ${val(m.name)}${m.strength ? ` ${m.strength}` : ""}`, { bold: true });
    pdf.text(`Dose: ${val(m.dose)}  |  Route: ${val(m.route)}`, { indent: 14 });
    pdf.text(`Frequency: ${val(m.frequency)}  |  Duration: ${val(m.duration)}`, { indent: 14 });
    pdf.text(`Instructions: ${val(m.instructions)}`, { indent: 14 });
    if (version.kind === "extraction") {
      const incomplete = [m.name, m.strength, m.dose, m.frequency].some((field) => field === null);
      const uncertain = m.confidence < CHECK_THRESHOLD || incomplete;
      pdf.text(`Reading confidence: ${Math.round(m.confidence * 100)}%${uncertain ? "   [NEEDS CHECKING]" : ""}`, { indent: 14, color: uncertain ? [0.7, 0, 0] : [0, 0, 0] });
    }
  });
  pdf.rule();

  pdf.text("Open this record in HealthHub", { size: 12, bold: true });
  pdf.text("Scan the code. Signing in is required, and access depends on the patient's consent. The code contains only a reference, no medical information.", { size: 9 });
  pdf.space(4);
  pdf.qr(qrMatrix(input.qrPayload), 3.2);
  pdf.text(input.qrPayload, { size: 8 });
  pdf.space(6);
  pdf.rule();

  pdf.text(`Generated ${input.generatedAt.toISOString()} (UTC).`, { size: 8 });
  pdf.text(
    "This document is a copy of the patient's own record. It is not a prescription and must not be used to dispense medication. The HealthHub patient ID is not an official national health ID.",
    { size: 8 },
  );
  return pdf.build();
}
