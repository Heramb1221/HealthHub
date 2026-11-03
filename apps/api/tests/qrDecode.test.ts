import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { qrMatrix } from "../src/pdf/qrMatrix.js";

const HAVE_ZBAR = spawnSync("zbarimg", ["--version"]).status === 0;

/** Render a QR matrix as an ASCII PBM image with a quiet zone, the way a phone camera would see it. */
function pbm(matrix: boolean[][], scale = 8, quiet = 4): string {
  const size = (matrix.length + quiet * 2) * scale;
  const rows: string[] = [];
  for (let y = 0; y < size; y += 1) {
    const r = Math.floor(y / scale) - quiet;
    const row: string[] = [];
    for (let x = 0; x < size; x += 1) {
      const c = Math.floor(x / scale) - quiet;
      row.push(matrix[r]?.[c] ? "1" : "0");
    }
    rows.push(row.join(" "));
  }
  return `P1\n${size} ${size}\n${rows.join("\n")}\n`;
}

function scan(payload: string): string {
  const dir = mkdtempSync(join(tmpdir(), "hh-qrscan-"));
  try {
    const file = join(dir, "qr.pbm");
    writeFileSync(file, pbm(qrMatrix(payload)));
    return spawnSync("zbarimg", ["-q", "--raw", file], { encoding: "utf8" }).stdout.replace(/\n$/, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!HAVE_ZBAR)("QR codes survive a real scan (independent decoder)", () => {
  const base = "https://health-hub-rose.vercel.app/";
  const healthId = "HH-7K2M9QXD";
  const sessionId = "6f1c2f0e-3b52-4f4b-9a5e-0d6e0c1d7a11";
  const prescriptionId = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

  it("decodes the health card, share-session and prescription links exactly", () => {
    for (const payload of [`${base}qr/${healthId}`, `${base}qr/${sessionId}`, `${base}prescription/${prescriptionId}`]) {
      expect(scan(payload)).toBe(payload);
    }
  });

  it("holds nothing but a link and an opaque id: no name, medicine, blood group or contact details", () => {
    const decoded = scan(`${base}qr/${healthId}`);
    expect(decoded).toMatch(/^https:\/\/[^/]+\/qr\/HH-[A-Z0-9]{8}$/);
    for (const medical of ["@", "+91", "mg", "B+", "allerg", "Dr."]) expect(decoded).not.toContain(medical);
  });

  it("still scans when the link base has a path", () => {
    const payload = `https://example.org/sehat/qr/${healthId}`;
    expect(scan(payload)).toBe(payload);
  });
});
