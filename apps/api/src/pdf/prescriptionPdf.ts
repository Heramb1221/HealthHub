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

  qrPayload: string;
  generatedAt: Date;
}

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

function formatPdfDate(dateStr: string | null, fallbackDate: Date): string {
  const d = dateStr ? new Date(dateStr) : fallbackDate;
  if (isNaN(d.getTime())) return dateStr || "";
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function buildPrescriptionPdf(input: PrescriptionPdfInput): Buffer {
  const { version } = input;
  const pdf = new PdfBuilder("Sehat Med - Clinical Prescription");

  const MARGIN = 40;
  const CONTENT_WIDTH = 515;
  const BORDER_COLOR: [number, number, number] = [0.84, 0.87, 0.90];
  const LABEL_BG: [number, number, number] = [0.96, 0.97, 0.98];
  const WHITE: [number, number, number] = [1, 1, 1];
  const ALT_ROW_BG: [number, number, number] = [0.97, 0.98, 0.99];
  const PRIMARY_DARK: [number, number, number] = [0.08, 0.22, 0.38];
  const HEADER_TEAL: [number, number, number] = [0.05, 0.40, 0.55];

  let y = 802;

  pdf.textAt("SEHAT MED", MARGIN, y - 18, { size: 20, bold: true, color: PRIMARY_DARK });
  pdf.textAt("PATIENT CARE * CLINICAL DOCUMENT RECORD", MARGIN, y - 30, {
    size: 7.5,
    bold: true,
    color: [0.45, 0.50, 0.55],
  });

  const dateFormatted = formatPdfDate(version.prescriptionDate, input.generatedAt);
  pdf.textAt("PRESCRIPTION", 445, y - 14, { size: 11, bold: true, color: [0.10, 0.15, 0.22] });
  pdf.textAt(`Date: ${dateFormatted}`, 445, y - 26, { size: 8.5, color: [0.25, 0.30, 0.35] });

  y -= 38;
  pdf.lineAt(MARGIN, y, MARGIN + CONTENT_WIDTH, y, { stroke: HEADER_TEAL, strokeWidth: 2 });
  y -= 14;

  pdf.textAt("PATIENT INFORMATION", MARGIN, y, { size: 9, bold: true, color: PRIMARY_DARK });
  y -= 6;

  const pRowH = 17;
  const pCol1W = 105;
  const pCol2W = 150;
  const pCol3W = 95;
  const pCol4W = 165;

  const patientRows: Array<[string, string, string, string]> = [
    [
      "Patient name",
      input.patientName || "________________________________",
      "Patient ID",
      input.healthId || "____________________",
    ],
    [
      "Date of birth / Age",
      input.patientDob ? `${input.patientDob}` : "________________________",
      "Gender",
      input.patientGender ? `${input.patientGender}` : "____________________",
    ],
    [
      "Contact number",
      input.patientPhone ? `${input.patientPhone}` : "________________________________",
      "Blood group",
      "____________________",
    ],
    [
      "Allergies",
      "________________________________",
      "Weight",
      "____________________",
    ],
  ];

  for (const [lbl1, val1, lbl2, val2] of patientRows) {
    const rowY = y - pRowH;

    pdf.box(MARGIN, rowY, pCol1W, pRowH, { fill: LABEL_BG, stroke: BORDER_COLOR, strokeWidth: 0.5 });
    pdf.textAt(lbl1, MARGIN + 6, rowY + 5, { size: 8, bold: true, color: [0.20, 0.25, 0.30] });

    pdf.box(MARGIN + pCol1W, rowY, pCol2W, pRowH, { fill: WHITE, stroke: BORDER_COLOR, strokeWidth: 0.5 });
    pdf.textAt(val1, MARGIN + pCol1W + 6, rowY + 5, { size: 8, color: [0.10, 0.15, 0.20] });

    pdf.box(MARGIN + pCol1W + pCol2W, rowY, pCol3W, pRowH, { fill: LABEL_BG, stroke: BORDER_COLOR, strokeWidth: 0.5 });
    pdf.textAt(lbl2, MARGIN + pCol1W + pCol2W + 6, rowY + 5, { size: 8, bold: true, color: [0.20, 0.25, 0.30] });

    pdf.box(MARGIN + pCol1W + pCol2W + pCol3W, rowY, pCol4W, pRowH, { fill: WHITE, stroke: BORDER_COLOR, strokeWidth: 0.5 });
    pdf.textAt(val2, MARGIN + pCol1W + pCol2W + pCol3W + 6, rowY + 5, { size: 8, bold: true, color: [0.10, 0.15, 0.20] });

    y -= pRowH;
  }

  y -= 12;

  pdf.textAt("PRESCRIBER & FACILITY", MARGIN, y, { size: 9, bold: true, color: PRIMARY_DARK });
  y -= 6;

  const prescriberRows: Array<[string, string]> = [
    [
      "Hospital / Clinic",
      input.hospitalName || "Apollo Multi-Specialty Hospital & Diagnostics",
    ],
    [
      "Prescriber",
      version.prescriberName
        ? (version.prescriberName.startsWith("Dr") ? version.prescriberName : `Dr. ${version.prescriberName}`)
        : "Dr. A. Kulkarni",
    ],
    [
      "Specialty / Registration No.",
      "_______________________________",
    ],
  ];

  const pfLabelW = 145;
  const pfValW = CONTENT_WIDTH - pfLabelW;

  for (const [lbl, valStr] of prescriberRows) {
    const rowY = y - pRowH;
    pdf.box(MARGIN, rowY, pfLabelW, pRowH, { fill: LABEL_BG, stroke: BORDER_COLOR, strokeWidth: 0.5 });
    pdf.textAt(lbl, MARGIN + 6, rowY + 5, { size: 8, bold: true, color: [0.20, 0.25, 0.30] });

    pdf.box(MARGIN + pfLabelW, rowY, pfValW, pRowH, { fill: WHITE, stroke: BORDER_COLOR, strokeWidth: 0.5 });
    pdf.textAt(valStr, MARGIN + pfLabelW + 6, rowY + 5, { size: 8, color: [0.10, 0.15, 0.20] });

    y -= pRowH;
  }

  y -= 14;

  pdf.box(MARGIN, y - 2, 7, 7, { fill: HEADER_TEAL });
  pdf.textAt("PRESCRIBED MEDICATIONS", MARGIN + 12, y - 2, { size: 9.5, bold: true, color: PRIMARY_DARK });
  y -= 10;

  const mColW = {
    num: 24,
    med: 125,
    dose: 60,
    route: 45,
    freq: 55,
    dur: 55,
    instr: 151,
  };

  const mHeadH = 17;
  pdf.box(MARGIN, y - mHeadH, CONTENT_WIDTH, mHeadH, { fill: [0.06, 0.20, 0.35] });
  let curX = MARGIN;

  const drawHeadCell = (text: string, w: number) => {
    pdf.textAt(text, curX + 5, y - mHeadH + 5, { size: 7.5, bold: true, color: [1, 1, 1] });
    curX += w;
  };

  drawHeadCell("#", mColW.num);
  drawHeadCell("MEDICINE", mColW.med);
  drawHeadCell("DOSE", mColW.dose);
  drawHeadCell("ROUTE", mColW.route);
  drawHeadCell("FREQUENCY", mColW.freq);
  drawHeadCell("DURATION", mColW.dur);
  drawHeadCell("INSTRUCTIONS", mColW.instr);
  y -= mHeadH;

  const mRowH = 18;
  const meds = version.medications;

  if (meds.length === 0) {
    pdf.box(MARGIN, y - mRowH, CONTENT_WIDTH, mRowH, { fill: WHITE, stroke: BORDER_COLOR, strokeWidth: 0.5 });
    pdf.textAt("No medications recorded.", MARGIN + 10, y - mRowH + 5, { size: 8, color: [0.4, 0.4, 0.4] });
    y -= mRowH;
  } else {
    meds.forEach((m, idx) => {

      if (y - mRowH < 180) {
        pdf.addPage();
        y = 802;
        pdf.textAt("PRESCRIBED MEDICATIONS (CONTINUED)", MARGIN, y, { size: 9, bold: true, color: PRIMARY_DARK });
        y -= 10;
        pdf.box(MARGIN, y - mHeadH, CONTENT_WIDTH, mHeadH, { fill: [0.06, 0.20, 0.35] });
        curX = MARGIN;
        drawHeadCell("#", mColW.num);
        drawHeadCell("MEDICINE", mColW.med);
        drawHeadCell("DOSE", mColW.dose);
        drawHeadCell("ROUTE", mColW.route);
        drawHeadCell("FREQUENCY", mColW.freq);
        drawHeadCell("DURATION", mColW.dur);
        drawHeadCell("INSTRUCTIONS", mColW.instr);
        y -= mHeadH;
      }

      const rowY = y - mRowH;
      const rowBg = idx % 2 === 0 ? WHITE : ALT_ROW_BG;

      const medName = `${m.name ?? "not recorded"}${m.strength ? ` ${m.strength}` : ""}`;
      const doseStr = m.dose ?? "not recorded";
      const routeStr = m.route ?? "Oral";
      const freqStr = m.frequency ?? "not recorded";
      const durStr = m.duration ?? "not recorded";

      const incomplete = [m.name, m.strength, m.dose, m.frequency].some((field) => field === null);
      const uncertain = (m.confidence < CHECK_THRESHOLD || incomplete) && version.kind === "extraction";
      const instrStr = `${m.instructions ?? "Not recorded"}${uncertain ? " [NEEDS CHECKING]" : ""}`;

      pdf.box(MARGIN, rowY, CONTENT_WIDTH, mRowH, { fill: rowBg, stroke: BORDER_COLOR, strokeWidth: 0.5 });

      curX = MARGIN;
      const drawRowCell = (text: string, w: number, isBold: boolean = false) => {
        pdf.textAt(text.slice(0, Math.floor(w / 4.8)), curX + 4, rowY + 5, {
          size: 7.5,
          bold: isBold,
          color: [0.12, 0.16, 0.22],
        });
        curX += w;
      };

      drawRowCell(String(idx + 1), mColW.num);
      drawRowCell(medName, mColW.med, true);
      drawRowCell(doseStr, mColW.dose);
      drawRowCell(routeStr, mColW.route);
      drawRowCell(freqStr, mColW.freq);
      drawRowCell(durStr, mColW.dur);
      drawRowCell(instrStr, mColW.instr);

      y -= mRowH;
    });
  }

  y -= 14;

  pdf.textAt("CLINICAL NOTES & FOLLOW-UP", MARGIN, y, { size: 9, bold: true, color: PRIMARY_DARK });
  y -= 6;

  const notesLabelW = 135;
  const notesValW = CONTENT_WIDTH - notesLabelW;

  const notesRows: Array<[string, string]> = [
    ["Diagnosis / Indication", "_______________________________________________________________"],
    ["Additional instructions", "_______________________________________________________________"],
    ["Follow-up date", "______________________________"],
  ];

  for (const [lbl, valStr] of notesRows) {
    const rowY = y - pRowH;
    pdf.box(MARGIN, rowY, notesLabelW, pRowH, { fill: LABEL_BG, stroke: BORDER_COLOR, strokeWidth: 0.5 });
    pdf.textAt(lbl, MARGIN + 6, rowY + 5, { size: 8, bold: true, color: [0.20, 0.25, 0.30] });

    pdf.box(MARGIN + notesLabelW, rowY, notesValW, pRowH, { fill: WHITE, stroke: BORDER_COLOR, strokeWidth: 0.5 });
    pdf.textAt(valStr, MARGIN + notesLabelW + 6, rowY + 5, { size: 8, color: [0.45, 0.50, 0.55] });

    y -= pRowH;
  }

  const sigRowH = 22;
  const sigY = y - sigRowH;
  pdf.box(MARGIN, sigY, notesLabelW, sigRowH, { fill: LABEL_BG, stroke: BORDER_COLOR, strokeWidth: 0.5 });
  pdf.textAt("Prescriber signature /", MARGIN + 6, sigY + 11, { size: 8, bold: true, color: [0.20, 0.25, 0.30] });
  pdf.textAt("stamp", MARGIN + 6, sigY + 3, { size: 8, bold: true, color: [0.20, 0.25, 0.30] });

  const sigW = 180;
  pdf.box(MARGIN + notesLabelW, sigY, sigW, sigRowH, { fill: WHITE, stroke: BORDER_COLOR, strokeWidth: 0.5 });
  pdf.textAt("_____________________________________", MARGIN + notesLabelW + 6, sigY + 6, {
    size: 7.5,
    color: [0.55, 0.60, 0.65],
  });

  const dateLblW = 45;
  const dateValW = CONTENT_WIDTH - notesLabelW - sigW - dateLblW;
  pdf.box(MARGIN + notesLabelW + sigW, sigY, dateLblW, sigRowH, { fill: LABEL_BG, stroke: BORDER_COLOR, strokeWidth: 0.5 });
  pdf.textAt("Date", MARGIN + notesLabelW + sigW + 8, sigY + 7, { size: 8, bold: true, color: [0.20, 0.25, 0.30] });

  pdf.box(MARGIN + notesLabelW + sigW + dateLblW, sigY, dateValW, sigRowH, { fill: WHITE, stroke: BORDER_COLOR, strokeWidth: 0.5 });
  pdf.textAt("________________", MARGIN + notesLabelW + sigW + dateLblW + 8, sigY + 7, {
    size: 7.5,
    color: [0.55, 0.60, 0.65],
  });

  y -= sigRowH + 16;

  const qrBoxY = Math.max(50, y - 56);
  const qrX = MARGIN + CONTENT_WIDTH - 64;

  pdf.textAt("SCAN TO OPEN HEALTH RECORD", MARGIN + 190, qrBoxY + 44, { size: 8.5, bold: true, color: [0.15, 0.20, 0.28] });
  pdf.textAt(`HealthHub ID: ${input.healthId}`, MARGIN + 215, qrBoxY + 32, { size: 7.5, color: [0.35, 0.40, 0.45] });
  pdf.textAt("QR links to this prescription record.", MARGIN + 200, qrBoxY + 20, { size: 7, color: [0.50, 0.55, 0.60] });

  const verificationStatusText =
    version.verificationStatus === "verified_by_authorized_clinician"
      ? "VERIFIED by an authorized clinician."
      : version.verificationStatus === "patient_corrected"
      ? "CORRECTED BY PATIENT. NOT verification by a doctor or pharmacist."
      : version.verificationStatus === "needs_review"
      ? "NEEDS REVIEW. Check every value against original prescription."
      : "UNVERIFIED. Check against original prescription.";

  const syntheticNote =
    version.kind === "extraction" && version.extractionProvider?.startsWith("mock")
      ? " - synthetic test extraction, not a real reading"
      : "";

  pdf.textAt(
    `Prescription record ID: ${input.prescriptionId} * Source: ${SOURCE_LABEL[input.sourceType] ?? input.sourceType}`,
    MARGIN,
    qrBoxY + 30,
    { size: 6.5, color: [0.65, 0.68, 0.72] },
  );
  pdf.textAt(
    `Verification status: ${STATUS_LABEL[version.verificationStatus] ?? version.verificationStatus} * Record version: ${version.versionNumber} (${version.kind === "patient_correction" ? "patient correction" : "automatic extraction"})${syntheticNote}`,
    MARGIN,
    qrBoxY + 20,
    { size: 6.5, color: [0.65, 0.68, 0.72] },
  );
  pdf.textAt(
    `HealthHub patient ID: ${input.healthId} * ${verificationStatusText} Generated ${input.generatedAt.toISOString()} (UTC). not an official national health ID.`,
    MARGIN,
    qrBoxY + 10,
    { size: 6.5, color: [0.65, 0.68, 0.72] },
  );

  pdf.textAt(input.qrPayload, MARGIN, qrBoxY, { size: 6, color: [0.70, 0.72, 0.75] });

  pdf.qrAt(qrMatrix(input.qrPayload), qrX, qrBoxY - 2, 1.85);

  pdf.lineAt(MARGIN, 34, MARGIN + CONTENT_WIDTH, 34, { stroke: [0.85, 0.88, 0.90], strokeWidth: 0.5 });
  pdf.textAt("SEHAT MED * Clinical prescription document", MARGIN, 24, { size: 7.5, color: [0.45, 0.50, 0.55] });
  pdf.textAt("Page 1", MARGIN + CONTENT_WIDTH - 30, 24, { size: 7.5, color: [0.45, 0.50, 0.55] });

  return pdf.build();
}
