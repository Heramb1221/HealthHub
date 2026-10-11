import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time.");

/** Reminder preferences. The medicine, dose and strength always come from the prescription, never from this form. */
export const reminderSchema = z
  .object({
    times: z
      .array(time)
      .min(1, "Add at least one reminder time.")
      .max(6, "Use up to 6 reminder times.")
      .refine((t) => new Set(t).size === t.length, "Each reminder time must be different."),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date."),
    endDate: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date.")
      .transform((v) => (v === "" ? null : v)),
  })
  .superRefine((v, ctx) => {
    if (v.endDate && v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "The end date can’t be before the start date." });
  });
