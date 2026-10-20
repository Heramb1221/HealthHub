
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const BOTTOM = 60;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

type Rgb = [number, number, number];

export function toPdfText(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 63;
    if (code < 32 || code === 127) out += " ";
    else if (code === 40 || code === 41 || code === 92) out += `\\${char}`;
    else if (code <= 126 || (code >= 160 && code <= 255)) out += char;
    else out += "?";
  }
  return out;
}

export function wrapText(text: string, size: number, bold: boolean, width: number): string[] {
  const maxChars = Math.max(8, Math.floor(width / (size * (bold ? 0.62 : 0.58))));
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const rawWord of paragraph.split(/\s+/).filter((w) => w.length > 0)) {
      let word = rawWord;
      while (word.length > maxChars) {
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      if (line.length === 0) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

const num = (n: number): string => (Math.round(n * 100) / 100).toString();

export class PdfBuilder {
  private pages: string[] = [""];
  private y = PAGE_HEIGHT - MARGIN;

  constructor(private readonly title: string) {}

  private get page(): number {
    return this.pages.length - 1;
  }

  private emit(ops: string): void {
    this.pages[this.page] += `${ops}\n`;
  }

  private ensure(height: number): void {
    if (this.y - height < BOTTOM) {
      this.pages.push("");
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  space(points: number): void {
    this.y -= points;
  }

  text(text: string, options: { size?: number; bold?: boolean; indent?: number; color?: Rgb } = {}): void {
    const size = options.size ?? 10;
    const bold = options.bold ?? false;
    const indent = options.indent ?? 0;
    const color = options.color ?? [0, 0, 0];
    const lineHeight = size * 1.35;
    for (const line of wrapText(text, size, bold, CONTENT_WIDTH - indent)) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      this.emit(
        `BT /${bold ? "F2" : "F1"} ${num(size)} Tf ${color.map(num).join(" ")} rg ${num(MARGIN + indent)} ${num(this.y)} Td (${toPdfText(line)}) Tj ET`,
      );
    }
  }

  banner(text: string, fill: Rgb): void {
    const size = 10.5;
    const lineHeight = size * 1.35;
    const padding = 8;
    const lines = wrapText(text, size, true, CONTENT_WIDTH - 2 * padding);
    const height = lines.length * lineHeight + 2 * padding;
    this.ensure(height + 6);
    this.y -= 6;
    this.emit(`${fill.map(num).join(" ")} rg ${num(MARGIN)} ${num(this.y - height)} ${num(CONTENT_WIDTH)} ${num(height)} re f`);
    let lineY = this.y - padding;
    for (const line of lines) {
      lineY -= lineHeight;
      this.emit(`BT /F2 ${num(size)} Tf 0 0 0 rg ${num(MARGIN + padding)} ${num(lineY + 3)} Td (${toPdfText(line)}) Tj ET`);
    }
    this.y -= height;
  }

  rule(): void {
    this.ensure(10);
    this.y -= 6;
    this.emit(`0.6 g ${num(MARGIN)} ${num(this.y)} ${num(CONTENT_WIDTH)} 0.6 re f`);
    this.y -= 4;
  }

  getY(): number {
    return this.y;
  }

  setY(newY: number): void {
    this.y = newY;
  }

  box(x: number, y: number, w: number, h: number, options: { fill?: Rgb; stroke?: Rgb; strokeWidth?: number } = {}): void {
    const { fill, stroke, strokeWidth } = options;
    let ops = "";
    if (strokeWidth !== undefined) {
      ops += `${num(strokeWidth)} w\n`;
    }
    if (fill && stroke) {
      ops += `${fill.map(num).join(" ")} rg\n${stroke.map(num).join(" ")} RG\n${num(x)} ${num(y)} ${num(w)} ${num(h)} re B\n`;
    } else if (fill) {
      ops += `${fill.map(num).join(" ")} rg\n${num(x)} ${num(y)} ${num(w)} ${num(h)} re f\n`;
    } else if (stroke) {
      ops += `${stroke.map(num).join(" ")} RG\n${num(x)} ${num(y)} ${num(w)} ${num(h)} re S\n`;
    }
    this.emit(ops);
  }

  textAt(text: string, x: number, y: number, options: { size?: number; bold?: boolean; color?: Rgb } = {}): void {
    const size = options.size ?? 10;
    const bold = options.bold ?? false;
    const color = options.color ?? [0, 0, 0];
    this.emit(
      `BT /${bold ? "F2" : "F1"} ${num(size)} Tf ${color.map(num).join(" ")} rg ${num(x)} ${num(y)} Td (${toPdfText(text)}) Tj ET`,
    );
  }

  addPage(): void {
    this.pages.push("");
    this.y = PAGE_HEIGHT - MARGIN;
  }

  lineAt(x1: number, y1: number, x2: number, y2: number, options: { stroke?: Rgb; strokeWidth?: number } = {}): void {
    const stroke = options.stroke ?? [0.7, 0.7, 0.7];
    const width = options.strokeWidth ?? 0.5;
    this.emit(`${num(width)} w\n${stroke.map(num).join(" ")} RG\n${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S\n`);
  }

  qrAt(matrix: boolean[][], x: number, y: number, moduleSize: number): void {
    const quiet = 2;
    const size = (matrix.length + 2 * quiet) * moduleSize;
    const top = y + size - quiet * moduleSize;
    let ops = `1 g ${num(x)} ${num(y)} ${num(size)} ${num(size)} re f\n0 g\n`;
    matrix.forEach((row, r) => {
      row.forEach((dark, c) => {
        if (dark) ops += `${num(x + (quiet + c) * moduleSize)} ${num(top - (r + 1) * moduleSize)} ${num(moduleSize)} ${num(moduleSize)} re\n`;
      });
    });
    this.emit(`${ops}f`);
  }

  qr(matrix: boolean[][], moduleSize: number): void {
    const quiet = 4;
    const size = (matrix.length + 2 * quiet) * moduleSize;
    this.ensure(size + 4);
    const left = MARGIN;
    const top = this.y - quiet * moduleSize;
    let ops = `1 g ${num(left)} ${num(this.y - size)} ${num(size)} ${num(size)} re f\n0 g\n`;
    matrix.forEach((row, r) => {
      row.forEach((dark, c) => {
        if (dark) ops += `${num(left + (quiet + c) * moduleSize)} ${num(top - (r + 1) * moduleSize)} ${num(moduleSize)} ${num(moduleSize)} re\n`;
      });
    });
    this.emit(`${ops}f`);
    this.y -= size + 4;
  }

  build(): Buffer {

    const fonts = (name: string) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
    const pageIds = this.pages.map((_p, i) => 6 + i * 2);
    const objects: string[] = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${this.pages.length} >>`,
      fonts("Helvetica"),
      fonts("Helvetica-Bold"),
      `<< /Title (${toPdfText(this.title)}) /Producer (HealthHub) >>`,
    ];
    this.pages.forEach((content, i) => {
      const id = 6 + i * 2;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${id + 1} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`,
      );
      objects.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}endstream`);
    });

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(Buffer.byteLength(pdf, "latin1"));
      pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf, "latin1");
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf, "latin1");
  }
}
