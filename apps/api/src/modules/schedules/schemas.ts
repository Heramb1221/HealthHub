import { z } from "zod";
import { parseDateOnly } from "../../lib/text.js";

const DAY_MS = 86_400_000;
const todayUtc = (): string => new Date().toISOString().slice(0, 10);
const shiftDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

const date = z.string().refine((value) => parseDateOnly(value) !== null, "not a real calendar date");

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Local reminder times: HH:MM (24 hour). Duplicates are removed and the list is sorted. */
const reminderTimes = z
  .array(z.string().regex(TIME))
  .max(12)
  .transform((times) => [...new Set(times)].sort());

/**
 * A real IANA time zone in `Area/Location` form (for example Asia/Kolkata), or UTC,
 * returned in its canonical spelling. Abbreviations such as IST (India, Israel, and
 * Ireland all use it) and legacy fixed-offset names such as EST are refused: they are
 * ambiguous or ignore daylight saving, and a wrong zone means a wrongly timed reminder.
 */
const timezone = z
  .string()
  .min(1)
  .max(64)
  .regex(/^(UTC|[A-Za-z]+(\/[A-Za-z0-9_+-]+)+)$/i)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "unknown time zone")
  .transform((value) => new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone);

export const createScheduleSchema = z
  .strictObject({
    prescriptionId: z.uuid(),
    // The version the patient was looking at: guards against scheduling a different row than the one they saw.
    versionNumber: z.number().int().min(1).max(1_000_000),
    medicationPosition: z.number().int().min(0).max(29),
    startDate: date,
    endDate: date.nullable().optional(),
    reminderTimes: reminderTimes.optional(),
    remindersEnabled: z.boolean().optional(),
    timezone,
  })
  .refine((v) => v.startDate >= shiftDays(todayUtc(), -30) && v.startDate <= shiftDays(todayUtc(), 365), "start date out of range")
  .refine((v) => !v.endDate || (v.endDate >= v.startDate && v.endDate <= shiftDays(v.startDate, 3650)), "end date out of range")
  .refine((v) => v.remindersEnabled !== true || (v.reminderTimes?.length ?? 0) > 0, "reminders need at least one time");

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

/**
 * Only reminder preferences, the end date, and active/inactive can change.
 * The medication text (name, strength, dose, frequency, ...) is deliberately
 * not editable here.
 */
export const updateScheduleSchema = z
  .strictObject({
    reminderTimes: reminderTimes.optional(),
    remindersEnabled: z.boolean().optional(),
    timezone: timezone.optional(),
    endDate: date.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);

export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;

export const doseEventSchema = z.strictObject({
  scheduledFor: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value)),
  status: z.enum(["taken", "skipped"]),
});

export const listSchedulesQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});
