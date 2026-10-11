import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEnv, EnvError } from "../src/config/env.js";
import { createExtractionProvider } from "../src/extraction/index.js";
import { FIXTURES, FIXTURE_MARKER } from "../src/extraction/fixtures.js";
import { MockExtractionProvider } from "../src/extraction/mockProvider.js";
import { buildSyntheticPdf } from "../src/extraction/syntheticDocuments.js";
import { ExtractionUnrecognizedError } from "../src/extraction/types.js";
import { sniffMime } from "../src/modules/prescriptions/fileValidation.js";

const input = (bytes: Buffer, mimeType = "application/pdf") => ({ bytes, mimeType });

describe("MockExtractionProvider", () => {
  it("is deterministic: the same document always yields the same output", async () => {
    const pdf = buildSyntheticPdf("clear-001");
    const first = await new MockExtractionProvider().extract(input(pdf));
    for (let i = 0; i < 3; i += 1) {
      expect(await new MockExtractionProvider().extract(input(Buffer.from(pdf)))).toEqual(first);
    }
    const shared = new MockExtractionProvider();
    expect(await shared.extract(input(pdf))).toEqual(await shared.extract(input(pdf)));
  });

  it("returns each fixture's fixed output for its synthetic document", async () => {
    const provider = new MockExtractionProvider();
    for (const id of Object.keys(FIXTURES)) {
      expect(await provider.extract(input(buildSyntheticPdf(id))), id).toEqual(FIXTURES[id]?.raw);
    }
  });

  it("recognises the marker inside an image-like file too", async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`${FIXTURE_MARKER}clear-001`)]);
    expect(await new MockExtractionProvider().extract(input(png, "image/png"))).toEqual(FIXTURES["clear-001"]?.raw);
  });

  it("never lets a caller mutate the shared fixtures", async () => {
    const provider = new MockExtractionProvider();
    const pdf = buildSyntheticPdf("clear-001");
    const first = (await provider.extract(input(pdf))) as { medications: unknown[] };
    first.medications.length = 0;
    const second = (await provider.extract(input(pdf))) as { medications: unknown[] };
    expect(second.medications).toHaveLength(2);
  });

  it("refuses anything that is not a known synthetic fixture, so it cannot invent medications for a real document", async () => {
    const provider = new MockExtractionProvider();
    const refused = [
      Buffer.alloc(0),
      Buffer.from("%PDF-1.4 a real prescription: Amoxicillin 500 mg three times daily"),
      Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 5)]),
      Buffer.from(`${FIXTURE_MARKER}`),
      Buffer.from(`${FIXTURE_MARKER}does-not-exist`),
      Buffer.from(`${FIXTURE_MARKER}CLEAR-001`),
      Buffer.from(`${FIXTURE_MARKER}../../etc/passwd`),
      Buffer.from("HEALTHHUB-SYNTHETIC-FIXTURE clear-001"),
      Buffer.from(`${FIXTURE_MARKER.toLowerCase()}clear-001`),
    ];
    for (const bytes of refused) {
      await expect(provider.extract(input(bytes)), JSON.stringify(bytes.subarray(0, 30).toString("latin1"))).rejects.toBeInstanceOf(
        ExtractionUnrecognizedError,
      );
    }
  });

  it("has a stable name that marks its output as synthetic", () => {
    expect(new MockExtractionProvider().name).toBe("mock-synthetic");
  });
});

describe("createExtractionProvider", () => {
  it("returns null when disabled and the mock when asked", () => {
    expect(createExtractionProvider("disabled")).toBeNull();
    expect(createExtractionProvider("mock")?.name).toBe("mock-synthetic");
  });
});

describe("EXTRACTION_PROVIDER setting", () => {
  const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/x", JWT_SECRET: "j".repeat(40) };

  it("is disabled by default", () => {
    expect(loadEnv(base).EXTRACTION_PROVIDER).toBe("disabled");
  });

  it("allows only disabled and mock; Gemini and anything else stop the server", () => {
    expect(loadEnv({ ...base, EXTRACTION_PROVIDER: "mock" }).EXTRACTION_PROVIDER).toBe("mock");
    for (const value of ["gemini", "GEMINI", "google", "openai", "tesseract", "enabled", "true", ""]) {
      try {
        loadEnv({ ...base, EXTRACTION_PROVIDER: value });
        expect.unreachable(value);
      } catch (err) {
        expect(err, value).toBeInstanceOf(EnvError);
        expect((err as EnvError).variables, value).toEqual(["EXTRACTION_PROVIDER"]);
      }
    }
  });
});

describe("synthetic PDFs", () => {
  it("are deterministic, recognised as PDFs, labelled synthetic, and carry their marker", () => {
    for (const id of Object.keys(FIXTURES)) {
      const pdf = buildSyntheticPdf(id);
      expect(pdf.equals(buildSyntheticPdf(id)), id).toBe(true);
      expect(sniffMime(pdf), id).toBe("application/pdf");
      const text = pdf.toString("latin1");
      expect(text, id).toContain("SYNTHETIC DEMO PRESCRIPTION - NOT A REAL DOCUMENT");
      expect(text, id).toContain(`${FIXTURE_MARKER}${id}`);
      expect(text.trimEnd().endsWith("%%EOF"), id).toBe(true);
    }
  });

  it("have a correct cross-reference table", () => {
    const pdf = buildSyntheticPdf("clear-001");
    const text = pdf.toString("latin1");
    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(5);
    entries.forEach((offset, i) => expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it("rejects an unknown fixture id", () => {
    expect(() => buildSyntheticPdf("nope")).toThrow();
  });

  it("match the committed fixture files exactly", () => {
    for (const id of Object.keys(FIXTURES)) {
      const onDisk = readFileSync(join(import.meta.dirname, "..", "fixtures", "synthetic", `${id}.pdf`));
      expect(onDisk.equals(buildSyntheticPdf(id)), `${id}.pdf is stale: run npm run fixtures:generate`).toBe(true);
    }
  });
});
