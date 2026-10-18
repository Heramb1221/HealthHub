import { z } from "zod";
import { AppError } from "./errors.js";
import { log } from "./logger.js";

/**
 * Parses untrusted input. On failure throws a generic VALIDATION_ERROR; the
 * submitted values are never echoed back.
 */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ");
    log("warn", `Validation failed: ${details}`);
    throw new AppError("VALIDATION_ERROR", `Validation failed: ${details}`);
  }
  return result.data;
}

export const uuidSchema = z.uuid();

/** Path parameters that are not UUIDs can never match a row, so they are reported as not found. */
export function uuidParam(value: unknown): string {
  const result = uuidSchema.safeParse(value);
  if (!result.success) throw new AppError("NOT_FOUND");
  return result.data;
}
