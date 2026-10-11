import { z } from "zod";

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? null : v));

const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date.")
  .refine((v) => v === "" || new Date(`${v}T00:00:00`) <= new Date(), "The prescription date can’t be in the future.")
  .transform((v) => (v === "" ? null : v));

export const uploadMetaSchema = z.object({
  prescriptionDate: optionalDate,
  prescriberName: optionalText(100, "Use 100 characters or fewer."),
});

export const medicationRowSchema = z.object({
  name: z.string().trim().min(1, "Enter the medicine name.").max(100, "Use 100 characters or fewer."),
  strength: optionalText(50, "Use 50 characters or fewer."),
  dose: optionalText(100, "Use 100 characters or fewer."),
  route: optionalText(50, "Use 50 characters or fewer."),
  frequency: optionalText(100, "Use 100 characters or fewer."),
  duration: optionalText(100, "Use 100 characters or fewer."),
  instructions: optionalText(300, "Use 300 characters or fewer."),
});

export const correctionSchema = z.object({
  prescriptionDate: optionalDate,
  prescriberName: optionalText(100, "Use 100 characters or fewer."),
  medications: z.array(medicationRowSchema).min(1, "Keep at least one medicine.").max(30, "A prescription can list up to 30 medicines."),
  confirmed: z.literal(true, { error: "Confirm that you checked these details against your paper prescription." }),
});
