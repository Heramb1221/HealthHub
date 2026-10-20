import { z } from "zod";

import type { UpdatePatientInput } from "@/lib/api/types";

export const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? null : v));

const optionalPhone = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\+?[\d][\d\s()-]{6,19}$/.test(v), "Enter a phone number using digits, spaces and + only.")
  .transform((v) => (v === "" ? null : v));

const listField = (label: string) =>
  z
    .string()
    .transform((v) =>
      v
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .refine((items) => items.length <= 30, `List up to 30 ${label}.`)
    .refine((items) => items.every((item) => item.length <= 100), "Keep each line to 100 characters or fewer.");

export const profileSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name.").max(100, "Use 100 characters or fewer."),
    dateOfBirth: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date.")
      .refine((v) => v === "" || new Date(`${v}T00:00:00`) <= new Date(), "Date of birth can’t be in the future.")
      .transform((v) => (v === "" ? null : v)),
    gender: z.enum(["", ...GENDER_OPTIONS.map((o) => o.value)]).transform((v) => (v === "" ? null : v)),
    bloodGroup: z.enum(["", ...BLOOD_GROUPS]).transform((v) => (v === "" ? null : v)),
    phone: optionalPhone,
    address: optionalText(300, "Use 300 characters or fewer."),
    emergencyName: optionalText(100, "Use 100 characters or fewer."),
    emergencyRelationship: optionalText(50, "Use 50 characters or fewer."),
    emergencyPhone: optionalPhone,
    allergies: listField("allergies"),
    conditions: listField("conditions"),
    currentMedications: listField("medicines"),
  })
  .superRefine((value, ctx) => {
    const any = value.emergencyName || value.emergencyRelationship || value.emergencyPhone;
    if (!any) return;
    if (!value.emergencyName) ctx.addIssue({ code: "custom", path: ["emergencyName"], message: "Enter the contact’s name." });
    if (!value.emergencyPhone) ctx.addIssue({ code: "custom", path: ["emergencyPhone"], message: "Enter the contact’s phone number." });
  });

export type ProfileFormValues = z.output<typeof profileSchema>;

export function toUpdateInput(v: ProfileFormValues): UpdatePatientInput {
  return {
    fullName: v.fullName,
    dateOfBirth: v.dateOfBirth,
    gender: v.gender as UpdatePatientInput["gender"],
    bloodGroup: v.bloodGroup as UpdatePatientInput["bloodGroup"],
    phone: v.phone,
    address: v.address,
    emergencyContact: { name: v.emergencyName, relationship: v.emergencyRelationship, phone: v.emergencyPhone },
    allergies: v.allergies,
    conditions: v.conditions,
    currentMedications: v.currentMedications,
  };
}
