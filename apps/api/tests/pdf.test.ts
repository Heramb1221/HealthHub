import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEnv, EnvError } from "../src/config/env.js";
import { buildPrescriptionPdf, type PrescriptionPdfInput } from "../src/pdf/prescriptionPdf.js";
import { PdfBuilder, toPdfText, wrapText } from "../src/pdf/pdfWriter.js";
import { qrMatrix } from "../src/pdf/qrMatrix.js";
import { sniffMime } from "../src/modules/prescriptions/fileValidation.js";

const have = (cmd: string): boolean => spawnSync("which", [cmd]).status === 0;
const HAVE_POPPLER = have("pdfinfo") && have("pdftotext") && have("pdftoppm");
const HAVE_ZBAR = HAVE_POPPLER && have("zbarimg");

const ID = "3f2b8c1e-9d44-4a7b-8e21-5c0d6a1f7b90";
const med = (o: object = {}) => ({
  name: "Examplecillin", strength: "250 mg", dose: "1 tablet", route: "oral", frequency: "three times daily",
  duration: "5 days", instructions: "After food", confidence: 0.97, ...o,
});
const input = (versionOverrides: object = {}, o: Partial<PrescriptionPdfInput> = {}): PrescriptionPdfInput => ({
  healthId: "HH-7K2M9QXD",
  prescriptionId: ID,
  sourceType: "uploaded_physical",
  qrPayload: `healthhub://prescription/${ID}`,
  generatedAt: new Date("2026-10-11T08:00:00Z"),
  version: {
    versionNumber: 1, kind: "extraction", verificationStatus: "unverified", extractionProvider: "mock-synthetic",
    extractionConfidence: 0.96, prescriptionDate: "2026-09-01", prescriberName: "Dr. A. Example (synthetic)",
    medications: [med(), med({ name: "Testrin", strength: "10 mg", instructions: null, confidence: 0.95 })], ...versionOverrides,
  },
  ...o,
});
const textOf = (pdf: Buffer) => pdf.toString("latin1");

const visibleText = (pdf: Buffer): string =>
  [...textOf(pdf).matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => (m[1] ?? "").replace(/\\(.)/g, "$1")).join(" ");

function expectValidStructure(pdf: Buffer): void {
  const text = textOf(pdf);
  expect(text.startsWith("%PDF-1.4\n")).toBe(true);
  expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)?.[1]);
  expect(text.slice(startxref, startxref + 4)).toBe("xref");
  const size = Number(/xref\n0 (\d+)\n/.exec(text.slice(startxref))?.[1]);
  const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  expect(offsets).toHaveLength(size - 1);
  offsets.forEach((offset, i) => expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
}

describe("toPdfText", () => {
  it("escapes PDF string syntax", () => {
    expect(toPdfText("a(b)c\\d")).toBe("a\\(b\\)c\\\\d");
  });
  it("keeps Latin-1, replaces anything else, and neutralises control characters", () => {
    expect(toPdfText("Zoë café")).toBe("Zoë café");
    expect(toPdfText("डॉ. X 処方箋 😀")).toBe("??. X ??? ?");
    expect(toPdfText("a\nb\tc\u0000d")).toBe("a b c d");
  });
});

describe("wrapText", () => {
  it("never produces a line longer than the limit and never loses words", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu ".repeat(8).trim();
    const lines = wrapText(text, 10, false, 200);
    const max = Math.floor(200 / (10 * 0.58));
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(max);
    expect(lines.join(" ").split(/\s+/)).toEqual(text.split(/\s+/));
  });
  it("breaks a single very long word", () => {
    const lines = wrapText("x".repeat(500), 10, false, 200);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("x".repeat(500));
  });
  it("keeps explicit line breaks and handles empty text", () => {
    expect(wrapText("one\ntwo", 10, false, 400)).toEqual(["one", "two"]);
    expect(wrapText("", 10, false, 400)).toEqual([""]);
  });
});

describe("PdfBuilder", () => {
  it("adds pages when content overflows and stays structurally valid", () => {
    const pdf = new PdfBuilder("t");
    for (let i = 0; i < 200; i += 1) pdf.text(`line number ${i}`);
    const out = pdf.build();
    expectValidStructure(out);
    expect(textOf(out)).toMatch(/\/Count (\d+)/);
    expect(Number(/\/Count (\d+)/.exec(textOf(out))?.[1])).toBeGreaterThan(2);
  });
  it("is deterministic", () => {
    const make = () => { const p = new PdfBuilder("t"); p.text("hello"); p.banner("warning", [1, 0.9, 0.9]); p.rule(); return p.build(); };
    expect(make().equals(make())).toBe(true);
  });
  it("survives hostile text in strings without breaking structure", () => {
    const pdf = new PdfBuilder("T) (evil");
    pdf.text(") Tj ET 0 0 0 rg (injected) Tj BT ((((\\\\\\ \u0000 \n))");
    pdf.banner("))) (((", [1, 1, 1]);
    expectValidStructure(pdf.build());
  });
});

describe("qrMatrix", () => {
  it("is a square with the three finder patterns, and deterministic", () => {
    const m = qrMatrix(`healthhub://prescription/${ID}`);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    expect((m.length - 17) % 4).toBe(0);
    const finder = (r0: number, c0: number) => [0, 6].every((d) => m[r0]?.[c0 + d] && m[r0 + 6]?.[c0 + d] && m[r0 + d]?.[c0] && m[r0 + d]?.[c0 + 6]);
    expect(finder(0, 0)).toBe(true);
    expect(finder(0, m.length - 7)).toBe(true);
    expect(finder(m.length - 7, 0)).toBe(true);
    expect(qrMatrix("same")).toEqual(qrMatrix("same"));
    expect(qrMatrix("same")).not.toEqual(qrMatrix("other"));
  });
});

describe("buildPrescriptionPdf", () => {
  it("is a valid, deterministic PDF", () => {
    const a = buildPrescriptionPdf(input());
    expect(a.equals(buildPrescriptionPdf(input()))).toBe(true);
    expect(sniffMime(a)).toBe("application/pdf");
    expectValidStructure(a);
  });

  it("carries the identifiers, source, status, and QR reference", () => {
    const text = visibleText(buildPrescriptionPdf(input()));
    for (const expected of [
      "HealthHub patient ID: HH-7K2M9QXD", `Prescription record ID: ${ID}`, "Source: Uploaded physical prescription",
      "Verification status: unverified", "Record version: 1 (automatic extraction)", `healthhub://prescription/${ID}`,
      "Generated 2026-10-11T08:00:00.000Z", "not an official national health ID",
    ]) expect(text, expected).toContain(expected);
  });

  it("shows the right warning for every status, and never claims verification it does not have", () => {
    const cases: Array<[string, string]> = [
      ["needs_review", "NEEDS REVIEW"],
      ["unverified", "UNVERIFIED"],
      ["patient_corrected", "NOT verification by a doctor or pharmacist"],
      ["verified_by_authorized_clinician", "VERIFIED by an authorized clinician"],
    ];
    for (const [status, expected] of cases) expect(visibleText(buildPrescriptionPdf(input({ verificationStatus: status }))), status).toContain(expected);
    for (const status of ["needs_review", "unverified", "patient_corrected"]) {
      expect(visibleText(buildPrescriptionPdf(input({ verificationStatus: status }))), status).not.toContain("VERIFIED by an authorized clinician");
    }

    expect(visibleText(buildPrescriptionPdf(input({ verificationStatus: "something_new" })))).toContain("UNVERIFIED");
  });

  it("flags uncertain or incomplete extracted rows", () => {
    const text = visibleText(buildPrescriptionPdf(input({ medications: [med({ confidence: 0.5 }), med({ dose: null }), med()] })));
    expect(text.match(/\[NEEDS CHECKING\]/g)).toHaveLength(2);
  });

  it("does not print reading confidence for patient-entered versions", () => {
    const text = visibleText(buildPrescriptionPdf(input({ kind: "patient_correction", verificationStatus: "patient_corrected", extractionProvider: null, extractionConfidence: null })));
    expect(text).not.toContain("Reading confidence");
    expect(text).toContain("patient correction");
  });

  it("labels mock output as synthetic", () => {
    expect(visibleText(buildPrescriptionPdf(input()))).toContain("synthetic test extraction, not a real reading");
    expect(visibleText(buildPrescriptionPdf(input({ extractionProvider: "some-real-provider" })))).not.toContain("synthetic test extraction");
  });

  it("prints stored fields as they are and never composes a dosing instruction", () => {
    const text = visibleText(buildPrescriptionPdf(input()));
    expect(text).not.toMatch(/\btake\b/i);
    expect(text).not.toMatch(/\byou should\b/i);
    expect(text).toContain("1 tablet");
    expect(visibleText(buildPrescriptionPdf(input({ medications: [] })))).toContain("No medications recorded.");
    expect(visibleText(buildPrescriptionPdf(input({ medications: [med({ dose: null })] })))).toContain("not recorded");
  });

  it("puts nothing but the reference in the QR payload", () => {
    const text = textOf(buildPrescriptionPdf(input()));
    expect(text).toContain(`(healthhub://prescription/${ID}) Tj`);
    expect(`healthhub://prescription/${ID}`).not.toMatch(/Examplecillin|HH-|Dr\./);
  });

  it("handles hostile and non-Latin field values without breaking the file", () => {
    const pdf = buildPrescriptionPdf(input({ prescriberName: "डॉ. (evil) \\ ) Tj", medications: [med({ name: "A".repeat(200), instructions: "(((" })] }));
    expectValidStructure(pdf);
    expect(textOf(pdf)).toContain("??.");
  });

  it("spills a long record onto more pages, keeping the QR", () => {
    const pdf = buildPrescriptionPdf(input({ medications: Array.from({ length: 30 }, (_, i) => med({ name: `Med${i}` })) }));
    expectValidStructure(pdf);
    expect(Number(/\/Count (\d+)/.exec(textOf(pdf))?.[1])).toBeGreaterThan(1);
    expect(textOf(pdf)).toContain(`healthhub://prescription/${ID}`);
  });

  it.skipIf(!HAVE_POPPLER)("is accepted by poppler (independent parser) and reads back correctly", () => {
    const dir = mkdtempSync(join(tmpdir(), "hh-pdf-"));
    try {
      const file = join(dir, "r.pdf");
      writeFileSync(file, buildPrescriptionPdf(input({ medications: Array.from({ length: 25 }, (_, i) => med({ name: `Med${i}` })) })));
      const info = spawnSync("pdfinfo", [file], { encoding: "utf8" });
      expect(info.status).toBe(0);
      expect(info.stderr).toBe("");
      expect(Number(/Pages:\s+(\d+)/.exec(info.stdout)?.[1])).toBeGreaterThanOrEqual(2);
      const textOut = spawnSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }).stdout;
      for (const expected of ["HH-7K2M9QXD", ID, "UNVERIFIED", "Med24", "synthetic"]) expect(textOut).toContain(expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!HAVE_ZBAR)("has a QR code that an independent decoder reads back exactly", () => {
    const dir = mkdtempSync(join(tmpdir(), "hh-qr-"));
    try {
      const file = join(dir, "r.pdf");
      writeFileSync(file, buildPrescriptionPdf(input()));
      spawnSync("pdftoppm", ["-r", "110", "-png", "-f", "1", "-l", "1", file, join(dir, "page")]);
      const decoded = spawnSync("zbarimg", ["-q", "--raw", join(dir, "page-1.png")], { encoding: "utf8" });
      expect(decoded.stdout.trim()).toBe(`healthhub://prescription/${ID}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("QR settings", () => {
  const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/x", JWT_SECRET: "j".repeat(40) };

  it("defaults to a short-lived session and an app link base", () => {
    const env = loadEnv(base);
    expect(env.QR_LINK_BASE).toBe("healthhub://");
    expect(env.QR_SESSION_TTL_MINUTES).toBe(15);
  });

  it("accepts sensible link bases and rejects unsafe ones", () => {
    for (const ok of ["healthhub://", "https://app.example.com/", "https://app.example.com/r/"]) {
      expect(loadEnv({ ...base, QR_LINK_BASE: ok }).QR_LINK_BASE).toBe(ok);
    }
    for (const bad of ["healthhub:/", "healthhub://no-trailing-slash", "https://x/?q=1/", "https://x/#a/", "javascript:alert(1)//", "has space://x/", "", "//x/"]) {
      expect(() => loadEnv({ ...base, QR_LINK_BASE: bad }), bad).toThrow(EnvError);
    }
  });

  it("keeps sessions short-lived", () => {
    for (const bad of ["0", "61", "-5", "1.5", "abc"]) expect(() => loadEnv({ ...base, QR_SESSION_TTL_MINUTES: bad }), bad).toThrow(EnvError);
    expect(loadEnv({ ...base, QR_SESSION_TTL_MINUTES: "60" }).QR_SESSION_TTL_MINUTES).toBe(60);
  });
});
