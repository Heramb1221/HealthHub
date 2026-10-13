import { FIXTURES, FIXTURE_MARKER } from "./fixtures.js";

const escapePdfText = (text: string): string => text.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "?");

/**
 * Builds a small, valid, fully deterministic PDF for a fixture id (no dates,
 * no random ids), so the same fixture always yields identical bytes. The PDF
 * is visibly labelled synthetic and carries the marker the mock provider looks for.
 */
export function buildSyntheticPdf(fixtureId: string): Buffer {
  const fixture = FIXTURES[fixtureId];
  if (!fixture) throw new Error(`unknown synthetic fixture: ${fixtureId}`);

  const lines = [
    "SYNTHETIC DEMO PRESCRIPTION - NOT A REAL DOCUMENT",
    "For software testing only. Not medical information.",
    `${FIXTURE_MARKER}${fixtureId}`,
    "",
    ...fixture.documentLines,
  ];
  const text = lines.map((line, i) => `${i === 0 ? "" : "T* "}(${escapePdfText(line)}) Tj`).join("\n");
  const stream = `BT\n/F1 11 Tf\n14 TL\n50 780 Td\n${text}\nET`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
