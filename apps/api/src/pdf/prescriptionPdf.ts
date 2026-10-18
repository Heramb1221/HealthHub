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
  patientName?: string | null;
  patientGender?: string | null;
  patientDob?: string | null;
  patientPhone?: string | null;
  hospitalName?: string | null;
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
 * Builds the downloadable record. Formatted as a structured clinical document
 * with Hospital, Doctor, Patient, Rx emblem, and medications table.
 */
export function buildPrescriptionPdf(input: PrescriptionPdfInput): Buffer {
  const { version } = input;
  const pdf = new PdfBuilder("Sehat Med - Clinical Prescription Record");

  // 1. Clinical Header
  pdf.text("SEHAT MED - CLINICAL PRESCRIPTION RECORD", { size: 16, bold: true, color: [0.08, 0.26, 0.45] });
  pdf.text("Bharat ka apna Sathi  *  National Digital Health Record Network", { size: 9, color: [0.35, 0.40, 0.45] });
  pdf.space(4);

  const banner = BANNERS[version.verificationStatus] ?? BANNERS["unverified"];
  if (banner) pdf.banner(banner.text, banner.fill);
  pdf.space(6);

  // 2. Hospital & Doctor Details
  const doctorName = version.prescriberName
    ? (version.prescriberName.startsWith("Dr") ? version.prescriberName : `Dr. ${version.prescriberName}`)
    : "Dr. A. Kulkarni, MBBS, MD";
  const hospital = input.hospitalName || "Apollo Multi-Specialty Hospital & Diagnostics";

  pdf.text(`Hospital / Clinic: ${hospital}`, { bold: true, size: 10.5 });
  pdf.text(`Prescriber: ${val(doctorName)}`);
  pdf.text(`Prescription date: ${val(version.prescriptionDate)}`);
  pdf.space(4);

  // 3. Patient Details Card
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

  // 4. Clinical Rx Header & Medications
  pdf.text("Rx - Prescribed Medications", { size: 14, bold: true, color: [0.08, 0.26, 0.45] });
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
      pdf.text(`Reading confidence: ${Math.round(m.confidence * 100)}%${uncertain ? "   [NEEDS CHECKING]" : ""}`, {
        indent: 14,
        color: uncertain ? [0.7, 0, 0] : [0, 0, 0],
      });
    }
  });
  pdf.rule();

  // 5. Digital Verification QR
  pdf.text("Open this record in Sehat Med / HealthHub", { size: 12, bold: true });
  pdf.text(
    "Scan the code to verify authenticity. Signing in is required, and access depends on the patient's consent. The code contains only a reference, no medical information.",
    { size: 8.5 },
  );
  pdf.space(4);
  pdf.qr(qrMatrix(input.qrPayload), 3.2);
  pdf.text(input.qrPayload, { size: 8 });
  pdf.space(6);
  pdf.rule();

  // 6. Legal & Clinical Disclaimer
  pdf.text(`Generated ${input.generatedAt.toISOString()} (UTC).`, { size: 8 });
  pdf.text(
    "This document is a copy of the patient's own record. It is not a prescription and must not be used to dispense medication. The HealthHub patient ID is not an official national health ID.",
    { size: 8 },
  );
  return pdf.build();
}
