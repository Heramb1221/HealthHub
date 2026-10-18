import { z } from "zod";
import { hasNoControlChars, parseDateOnly } from "../../lib/text.js";

export const GENDERS = ["female", "male", "other", "prefer_not_to_say"] as const;
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

const PHONE = /^\+?[0-9][0-9 ()-]{5,18}[0-9]$/;

const text = (max: number) => z.string().trim().min(1).max(max).refine(hasNoControlChars);
const phone = z.string().trim().regex(PHONE);

/** Trims, bounds, and removes case-insensitive duplicates while keeping the first spelling and order. */
const list = z
  .array(text(100))
  .max(30)
  .transform((items) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

const MIN_DOB = "1900-01-01";

// Refinements may still run after the format check fails, so none of them may throw.
const dateOfBirth = z.iso
  .date()
  .refine((value) => parseDateOnly(value) !== null, "not a real calendar date")
  .refine((value) => value >= MIN_DOB, "too early")
  .refine((value) => value <= new Date().toISOString().slice(0, 10), "in the future")
  .transform((value) => parseDateOnly(value) as Date);

const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && !v.trim() ? null : v), schema);

const emergencyContact = z
  .strictObject({
    name: emptyToNull(text(120).nullable().optional()),
    relationship: emptyToNull(text(60).nullable().optional()),
    phone: emptyToNull(phone.nullable().optional()),
  })
  .refine((value) => Object.keys(value).length > 0);

/**
 * Strict: anything not listed (healthId, id, userId, role, timestamps, ...) is
 * rejected, not ignored. Nullable fields can be cleared with null. Arrays
 * replace the stored list.
 */
export const updateProfileSchema = z
  .strictObject({
    fullName: emptyToNull(text(120).nullable().optional()),
    dateOfBirth: emptyToNull(dateOfBirth.nullable().optional()),
    gender: emptyToNull(z.enum(GENDERS).nullable().optional()),
    bloodGroup: emptyToNull(z.enum(BLOOD_GROUPS).nullable().optional()),
    phone: emptyToNull(phone.nullable().optional()),
    emergencyContact: emergencyContact.nullable().optional(),
    allergies: list.optional(),
    existingConditions: list.optional(),
    conditions: list.optional(),
    currentMedications: list.optional(),
    address: emptyToNull(text(300).nullable().optional()),
  })
  .refine((value) => Object.keys(value).length > 0);

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const accessHistoryQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});
