/**
 * DEMO ONLY. A tiny, dependency-free PDF writer (text only, Helvetica) so the "Download PDF" action works
 * end to end without the real API. The real PDF comes from GET /prescriptions/:id/pdf.
 */
export interface PdfLine {
  text: string;
  bold?: boolean;
  size?: number;
  /** Extra space above this line, in points. */
  gap?: number;
}

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 56;

function clean(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2192]/g, "-")
    .replace(/\u00B7/g, "|")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrap(text: string, size: number): string[] {
  const maxChars = Math.floor((PAGE_W - MARGIN * 2) / (size * 0.5));
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export function buildPdf(input: PdfLine[]): Blob {
  const pages: string[][] = [[]];
  let y = PAGE_H - MARGIN;
  for (const entry of input) {
    const size = entry.size ?? 11;
    const lead = size * 1.45;
    const lines = wrap(entry.text, size);
    y -= entry.gap ?? 0;
    for (const text of lines) {
      if (y - lead < MARGIN) {
        pages.push([]);
        y = PAGE_H - MARGIN;
      }
      y -= lead;
      pages[pages.length - 1].push(`BT /${entry.bold ? "F2" : "F1"} ${size} Tf ${MARGIN} ${y.toFixed(1)} Td (${clean(text)}) Tj ET`);
    }
  }

  // Object layout: 1 catalog, 2 pages, 3 font regular, 4 font bold, then (page, content) pairs.
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 5 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  pages.forEach((ops, i) => {
    const pageId = 5 + i * 2;
    const content = ops.join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([out], { type: "application/pdf" });
}
