import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createWorker, type Worker } from "tesseract.js";
import { log } from "../lib/logger.js";
import { prepareForOcr } from "./imagePrep.js";
import { parsePrescriptionText, type OcrLine, type ParsedPrescription } from "./textParser.js";
import { ExtractionUnrecognizedError, type ExtractionInput, type ExtractionProvider } from "./types.js";

const require = createRequire(import.meta.url);
const SUPPORTED_IMAGES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Below this mean OCR confidence we also try the page rotated, in case the photo is sideways/upside down. */
const ROTATION_RETRY_BELOW = 60;

let workerPromise: Promise<Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const dataDir = path.join(path.dirname(require.resolve("@tesseract.js-data/eng/package.json")), "4.0.0_best_int");
    return createWorker("eng", 1, { langPath: dataDir, gzip: true, cachePath: path.join(os.tmpdir(), "sehat-tesseract-cache") });
  })().catch((error) => {
    workerPromise = null;
    throw error;
  });
  return workerPromise;
}

/** One OCR job at a time: a single WASM worker is memory-friendly and tesseract.js jobs are not re-entrant. */
function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

export async function disposeLocalOcr(): Promise<void> {
  const current = workerPromise;
  workerPromise = null;
  if (current) await (await current).terminate().catch(() => undefined);
}

interface Pass {
  parsed: ParsedPrescription;
  meanConfidence: number;
}

async function recognise(worker: Worker, image: Buffer, rotate: 0 | 90 | 180 | 270): Promise<Pass> {
  const prepared = await prepareForOcr(image, rotate);
  const { data } = await worker.recognize(prepared.bytes, {}, { text: true, blocks: true });
  const lines: OcrLine[] = (data.lines ?? []).map((l) => ({ text: l.text, confidence: l.confidence }));
  const meanConfidence = typeof data.confidence === "number" ? data.confidence : 0;
  return { parsed: parsePrescriptionText(lines, meanConfidence), meanConfidence };
}

const score = (p: Pass) => p.parsed.medications.length * 100 + p.meanConfidence;

/**
 * Reads printed prescriptions locally (Tesseract via WASM). Nothing is sent to a third party, which
 * matters for medical images. It does NOT read handwriting well; such images come back with no or
 * low-confidence medicines and are routed to patient review, never guessed.
 */
export class LocalOcrExtractionProvider implements ExtractionProvider {
  readonly name = "local-ocr";

  async extract(input: ExtractionInput): Promise<unknown> {
    if (!SUPPORTED_IMAGES.has(input.mimeType)) {
      // PDFs need a rasteriser this provider doesn't bundle; say so instead of returning an empty reading.
      throw new ExtractionUnrecognizedError({ cause: new Error(`local OCR does not read ${input.mimeType}`) });
    }

    return serial(async () => {
      let worker: Worker;
      try {
        worker = await getWorker();
      } catch (error) {
        log("error", "local OCR engine failed to start", { errorName: error instanceof Error ? error.name : "unknown" });
        throw error;
      }

      let best: Pass;
      try {
        best = await recognise(worker, input.bytes, 0);
      } catch (error) {
        // sharp/tesseract could not decode it: malformed, truncated or not really an image.
        throw new ExtractionUnrecognizedError({ cause: error });
      }

      if (best.meanConfidence < ROTATION_RETRY_BELOW || best.parsed.medications.length === 0) {
        for (const rotation of [90, 270, 180] as const) {
          try {
            const next = await recognise(worker, input.bytes, rotation);
            if (score(next) > score(best)) best = next;
          } catch {
            // keep the best pass so far
          }
          if (best.meanConfidence >= ROTATION_RETRY_BELOW && best.parsed.medications.length > 0) break;
        }
      }
      return best.parsed;
    });
  }
}
