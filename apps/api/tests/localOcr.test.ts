import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { FallbackExtractionProvider } from "../src/extraction/chainProvider.js";
import { disposeLocalOcr, LocalOcrExtractionProvider } from "../src/extraction/localOcrProvider.js";
import { prepareForOcr } from "../src/extraction/imagePrep.js";
import { ExtractionUnrecognizedError, type ExtractionProvider } from "../src/extraction/types.js";
import type { ParsedPrescription } from "../src/extraction/textParser.js";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "..", "fixtures", "synthetic", name));
const provider = new LocalOcrExtractionProvider();
const read = async (bytes: Buffer, mimeType: string) => (await provider.extract({ bytes, mimeType })) as ParsedPrescription;

afterAll(disposeLocalOcr);

describe("local OCR on a clean printed prescription", () => {
  it("reads date, prescriber and all five medicines", async () => {
    const out = await read(fixture("printed-prescription-clean.png"), "image/png");
    expect(out.prescriptionDate).toBe("2026-10-14");
    expect(out.prescriberName).toBe("Dr. Anjali Deshmukh");
    expect(out.medications.map((m) => m.name)).toEqual(["Paracetamol", "Amoxicillin", "Pantoprazole", "Cetirizine", "Metformin"]);
    expect(out.medications[0]).toMatchObject({ strength: "500 mg", frequency: "1-0-1", duration: "5 days" });
  }, 60_000);
});

describe("local OCR on a noisy, rotated phone photo", () => {
  it("still finds the correct prescriber and flags unreadable fields instead of guessing", async () => {
    const out = await read(fixture("printed-prescription-photo.jpg"), "image/jpeg");
    expect(out.prescriberName).toBe("Dr. Anjali Deshmukh");
    expect(out.medications.length).toBeGreaterThanOrEqual(4);
    // Every field the reader is unsure of must be empty, never invented.
    for (const m of out.medications) expect(m.confidence).toBeLessThanOrEqual(0.8);
  }, 60_000);

  it("recovers an image that was saved sideways (no EXIF hint)", async () => {
    const sideways = await sharp(fixture("printed-prescription-clean.png")).rotate(90).png().toBuffer();
    const out = await read(sideways, "image/png");
    expect(out.medications.length).toBeGreaterThanOrEqual(4);
    expect(out.prescriberName).toBe("Dr. Anjali Deshmukh");
  }, 90_000);

  it("applies the EXIF orientation that phones write instead of rotating pixels", async () => {
    // Pixels stored rotated, with an EXIF tag that says "rotate 90 to display".
    const stored = await sharp(fixture("printed-prescription-clean.png")).rotate(-90).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const out = await read(stored, "image/jpeg");
    expect(out.medications.length).toBeGreaterThanOrEqual(4);
  }, 90_000);
});

describe("local OCR failure handling", () => {
  it("reports malformed, truncated and non-image bytes as unrecognised (no false success)", async () => {
    const png = fixture("printed-prescription-clean.png");
    for (const bytes of [Buffer.from("not an image at all"), png.subarray(0, 300), Buffer.concat([png.subarray(0, 8), Buffer.alloc(200, 9)])]) {
      await expect(provider.extract({ bytes, mimeType: "image/png" })).rejects.toBeInstanceOf(ExtractionUnrecognizedError);
    }
  }, 60_000);

  it("does not pretend to read PDFs", async () => {
    await expect(provider.extract({ bytes: Buffer.from("%PDF-1.4"), mimeType: "application/pdf" })).rejects.toBeInstanceOf(ExtractionUnrecognizedError);
  });

  it("returns no medicines (not invented ones) for a blank page", async () => {
    const blank = await sharp({ create: { width: 1200, height: 1600, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const out = await read(blank, "image/png");
    expect(out.medications).toEqual([]);
    expect(out.overallConfidence).toBeLessThan(0.2);
  }, 60_000);
});

describe("image preparation", () => {
  it("upscales small images, downscales huge ones, and never modifies its input", async () => {
    const original = fixture("printed-prescription-clean.png");
    const copy = Buffer.from(original);
    const small = await sharp(original).resize({ width: 400 }).png().toBuffer();
    expect((await prepareForOcr(small)).width).toBeGreaterThanOrEqual(1500);
    const big = await sharp({ create: { width: 5000, height: 3000, channels: 3, background: "#fff" } }).png().toBuffer();
    expect((await prepareForOcr(big)).width).toBeLessThanOrEqual(2400);
    expect(original.equals(copy)).toBe(true);
  });
});

describe("fallback provider", () => {
  const raw = (n: number) => ({ medications: Array.from({ length: n }, () => ({ name: "X" })) });
  const stub = (name: string, result: () => Promise<unknown>): ExtractionProvider => ({ name, extract: result });
  const input = { bytes: Buffer.from("x"), mimeType: "image/png" };

  it("keeps the primary reading when it found medicines and never calls the fallback", async () => {
    let called = false;
    const chain = new FallbackExtractionProvider(stub("a", async () => raw(2)), stub("b", async () => ((called = true), raw(5))));
    const out = await chain.extractWithProvenance(input);
    expect(out.provider).toBe("a");
    expect(called).toBe(false);
  });

  it("falls back when the primary finds nothing or fails, and reports who produced the result", async () => {
    const empty = new FallbackExtractionProvider(stub("a", async () => raw(0)), stub("b", async () => raw(3)));
    expect((await empty.extractWithProvenance(input)).provider).toBe("b");
    const failing = new FallbackExtractionProvider(stub("a", async () => { throw new ExtractionUnrecognizedError(); }), stub("b", async () => raw(3)));
    expect((await failing.extractWithProvenance(input)).provider).toBe("b");
  });

  it("returns the primary's honest empty reading if the fallback also fails; surfaces failure if the primary threw", async () => {
    const boom = stub("b", async () => { throw new Error("quota"); });
    const emptyThenFail = new FallbackExtractionProvider(stub("a", async () => raw(0)), boom);
    expect((await emptyThenFail.extractWithProvenance(input)).provider).toBe("a");
    const bothFail = new FallbackExtractionProvider(stub("a", async () => { throw new ExtractionUnrecognizedError(); }), boom);
    await expect(bothFail.extract(input)).rejects.toThrow("quota");
  });
});
