import type { BloodGroup, Gender } from "../api/types.ts";

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const BLOOD_GROUPS: BloodGroup[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export function genderLabel(value: string | null | undefined): string {
  return GENDER_OPTIONS.find((g) => g.value === value)?.label ?? "Not provided";
}
