import { z } from "zod";
import { hasNoControlChars, parseDateOnly } from "../../lib/text.js";

const text = (max: number) => z.string().trim().min(1).max(max).refine(hasNoControlChars);

export const VACCINE_CATEGORY_ENUM = ["uip", "iap_private", "covid19", "special_travel", "custom"] as const;
export const VACCINATION_STATUS_ENUM = ["taken", "not_taken"] as const;

export const recordVaccinationSchema = z.strictObject({
  vaccineName: text(120),
  vaccineId: text(60).nullable().optional(),
  category: z.enum(VACCINE_CATEGORY_ENUM).optional().default("custom"),
  status: z.enum(VACCINATION_STATUS_ENUM),
  administeredDate: z
    .preprocess(
      (v) => (typeof v === "string" && !v.trim() ? null : v),
      z
        .string()
        .refine((v) => parseDateOnly(v) !== null, "not a real calendar date")
        .refine((v) => v >= "1900-01-01" && v <= new Date().toISOString().slice(0, 10), "out of range")
        .nullable()
        .optional(),
    ),
  notes: z.preprocess(
    (v) => (typeof v === "string" && !v.trim() ? null : v),
    text(500).nullable().optional(),
  ),
});

export type RecordVaccinationInput = z.infer<typeof recordVaccinationSchema>;

export const queryVaccinationsSchema = z.strictObject({
  patientId: z.uuid().optional(),
  category: z.enum(VACCINE_CATEGORY_ENUM).optional(),
  status: z.enum(VACCINATION_STATUS_ENUM).optional(),
});

export type QueryVaccinationsInput = z.infer<typeof queryVaccinationsSchema>;
