import type { Request } from "express";
import Busboy from "busboy";
import { AppError } from "../../lib/errors.js";

export interface ParsedUpload {
  file: { buffer: Buffer; declaredMime: string; filename: string | undefined };
  fields: Record<string, string>;
}

const OVERHEAD_BYTES = 64 * 1024;

export function parseUpload(req: Request, maxBytes: number): Promise<ParsedUpload> {
  const contentType = req.headers["content-type"] ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    return Promise.reject(new AppError("UNSUPPORTED_MEDIA_TYPE"));
  }
  const declaredLength = Number(req.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes + OVERHEAD_BYTES) {
    return Promise.reject(new AppError("PAYLOAD_TOO_LARGE"));
  }

  return new Promise<ParsedUpload>((resolve, reject) => {
    let busboy: Busboy.Busboy;
    try {
      busboy = Busboy({
        headers: req.headers,

        limits: { files: 1, fileSize: maxBytes + 1, fields: 5, fieldSize: 1024, parts: 6 },
      });
    } catch {
      reject(new AppError("VALIDATION_ERROR"));
      return;
    }

    const fields: Record<string, string> = {};
    let file: ParsedUpload["file"] | undefined;
    let failure: AppError | undefined;
    const fail = (error: AppError) => {
      failure ??= error;
    };

    busboy.on("field", (name, value, info) => {
      if (info.valueTruncated || name in fields) fail(new AppError("VALIDATION_ERROR"));
      else fields[name] = value;
    });

    busboy.on("file", (name, stream, info) => {
      if (name !== "file" || file) {
        fail(new AppError("VALIDATION_ERROR"));
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => fail(new AppError("PAYLOAD_TOO_LARGE")));
      stream.on("end", () => {
        file = { buffer: Buffer.concat(chunks), declaredMime: info.mimeType, filename: info.filename };
      });
    });

    busboy.on("filesLimit", () => fail(new AppError("VALIDATION_ERROR")));
    busboy.on("fieldsLimit", () => fail(new AppError("VALIDATION_ERROR")));
    busboy.on("partsLimit", () => fail(new AppError("VALIDATION_ERROR")));
    busboy.on("error", () => reject(new AppError("VALIDATION_ERROR")));
    busboy.on("close", () => {
      if (failure) reject(failure);
      else if (!file) reject(new AppError("VALIDATION_ERROR"));
      else resolve({ file, fields });
    });

    req.on("error", () => reject(new AppError("VALIDATION_ERROR")));
    req.pipe(busboy);
  });
}
