import { z } from "zod";

import type { HospitalInput } from "@/lib/api/types";

/** Client-side checks for fast feedback. The API validates again and is authoritative. Limits are ASSUMED. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? null : v));

export const hospitalSchema = z.object({
  name: z.string().trim().min(2, "Enter the hospital’s name.").max(120, "Use 120 characters or fewer."),
  city: optionalText(80, "Use 80 characters or fewer."),
  address: optionalText(200, "Use 200 characters or fewer."),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\+?[\d][\d\s()-]{6,19}$/.test(v), "Enter a phone number using digits, spaces and + only.")
    .transform((v) => (v === "" ? null : v)),
  specialties: z
    .string()
    .transform((v) =>
      v
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .refine((items) => items.length <= 20, "List up to 20 specialities.")
    .refine((items) => items.every((item) => item.length <= 60), "Keep each speciality to 60 characters or fewer.")
    .refine((items) => new Set(items.map((i) => i.toLowerCase())).size === items.length, "Each speciality should appear once."),
});

export function toHospitalInput(v: z.output<typeof hospitalSchema>): HospitalInput {
  return { name: v.name, city: v.city, address: v.address, phone: v.phone, specialties: v.specialties };
}
