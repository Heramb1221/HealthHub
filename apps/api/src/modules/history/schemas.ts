import { z } from "zod";
import { hasNoControlChars, parseDateOnly } from "../../lib/text.js";

const text = (max: number) => z.string().trim().min(1).max(max).refine(hasNoControlChars);

export const addConditionSchema = z.strictObject({
  title: text(120),
  notes: text(500).nullable().optional(),
  diagnosedOn: z
    .string()
    .refine((v) => parseDateOnly(v) !== null, "not a real calendar date")
    .refine((v) => v >= "1900-01-01" && v <= new Date().toISOString().slice(0, 10), "out of range")
    .nullable()
    .optional(),
});

export const listHistoryQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
  // Providers must name the patient; patients may omit it.
  patientId: z.uuid().optional(),
});
