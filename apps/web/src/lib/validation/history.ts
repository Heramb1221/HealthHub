import { z } from "zod";

export const conditionSchema = z.object({
  name: z.string().trim().min(2, "Enter the condition’s name.").max(100, "Use 100 characters or fewer."),
  diagnosedOn: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date.")
    .refine((v) => v === "" || new Date(`${v}T00:00:00`) <= new Date(), "The date can’t be in the future.")
    .transform((v) => (v === "" ? null : v)),
  notes: z
    .string()
    .trim()
    .max(500, "Use 500 characters or fewer.")
    .transform((v) => (v === "" ? null : v)),
});
