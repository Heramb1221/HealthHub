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

const emergencyContact = z
  .strictObject({
    name: text(120).nullable().optional(),
    phone: phone.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

/**
 * Strict: anything not listed (healthId, id, userId, role, timestamps, ...) is
 * rejected, not ignored. Nullable fields can be cleared with null. Arrays
 * replace the stored list.
 */
export const updateProfileSchema = z
  .strictObject({
    fullName: text(120).nullable().optional(),
    dateOfBirth: dateOfBirth.nullable().optional(),
    gender: z.enum(GENDERS).nullable().optional(),
    bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
    phone: phone.nullable().optional(),
    emergencyContact: emergencyContact.optional(),
    allergies: list.optional(),
    existingConditions: list.optional(),
    currentMedications: list.optional(),
    address: text(300).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const accessHistoryQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});
