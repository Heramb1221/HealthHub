import sharp from "sharp";

export interface PreparedImage {
  bytes: Buffer;
  width: number;
  height: number;
  notes: string[];
}

const MAX_INPUT_PIXELS = 60_000_000;
const MAX_WIDTH = 2400;
const MIN_WIDTH = 1500;

/**
 * Make a phone photo or scan easier for OCR to read. This only ever produces a *derived* copy in
 * memory: the original upload is stored untouched and is never replaced by this output.
 *
 *  - applies the EXIF orientation (phones store "rotated" photos this way),
 *  - flattens transparency onto white, converts to greyscale, stretches contrast,
 *  - down-scales very large images and up-scales small ones so text is a readable size,
 *  - sharpens lightly.
 *
 * Throws if the bytes are not a decodable image (malformed, truncated or not an image at all).
 */
export async function prepareForOcr(input: Buffer, rotateDegrees: 0 | 90 | 180 | 270 = 0): Promise<PreparedImage> {
  const notes: string[] = [];
  const base = sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS });
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error("image has no dimensions");

  let pipeline = sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  if (rotateDegrees) pipeline = pipeline.rotate(rotateDegrees);
  pipeline = pipeline.flatten({ background: "#ffffff" }).greyscale().normalise();

  // Orientation changes width/height; read the oriented size before deciding on scaling.
  const oriented = await pipeline.clone().png().toBuffer({ resolveWithObject: true });
  const width = oriented.info.width;

  if (width > MAX_WIDTH) {
    pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
    notes.push("downscaled");
  } else if (width < MIN_WIDTH) {
    pipeline = pipeline.resize({ width: MIN_WIDTH, kernel: "lanczos3" });
    notes.push("upscaled");
  }
  pipeline = pipeline.sharpen({ sigma: 0.8 });

  const out = await pipeline.png().toBuffer({ resolveWithObject: true });
  if (rotateDegrees) notes.push(`rotated${rotateDegrees}`);
  return { bytes: out.data, width: out.info.width, height: out.info.height, notes };
}
