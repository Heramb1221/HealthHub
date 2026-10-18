import { z } from "zod";
import { hasNoControlChars } from "../../lib/text.js";

const text = (max: number) => z.string().trim().min(1).max(max).refine(hasNoControlChars);

export const FAMILY_RELATIONSHIPS = [
  "father",
  "mother",
  "spouse",
  "brother",
  "sister",
  "son",
  "daughter",
  "paternal_grandfather",
  "paternal_grandmother",
  "maternal_grandfather",
  "maternal_grandmother",
  "other",
] as const;

export type FamilyRelationship = (typeof FAMILY_RELATIONSHIPS)[number];

export const VITAL_STATUSES = ["alive", "deceased", "unknown"] as const;
export type VitalStatus = (typeof VITAL_STATUSES)[number];

export type Generation = "grandparents" | "parents" | "current" | "children" | "other";

export function getGeneration(rel: FamilyRelationship): Generation {
  switch (rel) {
    case "paternal_grandfather":
    case "paternal_grandmother":
    case "maternal_grandfather":
    case "maternal_grandmother":
      return "grandparents";
    case "father":
    case "mother":
      return "parents";
    case "spouse":
    case "brother":
    case "sister":
      return "current";
    case "son":
    case "daughter":
      return "children";
    default:
      return "other";
  }
}

export const RELATIONSHIP_LABELS: Record<FamilyRelationship, string> = {
  father: "Father",
  mother: "Mother",
  spouse: "Spouse",
  brother: "Brother",
  sister: "Sister",
  son: "Son",
  daughter: "Daughter",
  paternal_grandfather: "Paternal Grandfather (Dad's Father)",
  paternal_grandmother: "Paternal Grandmother (Dad's Mother)",
  maternal_grandfather: "Maternal Grandfather (Mom's Father)",
  maternal_grandmother: "Maternal Grandmother (Mom's Mother)",
  other: "Other Relative",
};

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const createFamilyMemberSchema = z.strictObject({
  fullName: text(120),
  relationship: z.enum(FAMILY_RELATIONSHIPS),
  vitalStatus: z.enum(VITAL_STATUSES).default("alive"),
  age: z.coerce.number().int().min(0).max(130).nullable().optional(),
  bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
  conditions: z.array(text(100)).max(30).default([]),
  notes: text(500).nullable().optional(),
});

export type CreateFamilyMemberInput = z.infer<typeof createFamilyMemberSchema>;

export const updateFamilyMemberSchema = z
  .strictObject({
    fullName: text(120).optional(),
    relationship: z.enum(FAMILY_RELATIONSHIPS).optional(),
    vitalStatus: z.enum(VITAL_STATUSES).optional(),
    age: z.coerce.number().int().min(0).max(130).nullable().optional(),
    bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
    conditions: z.array(text(100)).max(30).optional(),
    notes: text(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "At least one field must be provided for update");

export type UpdateFamilyMemberInput = z.infer<typeof updateFamilyMemberSchema>;

export const queryFamilyMembersSchema = z.strictObject({
  patientId: z.uuid().optional(),
});

export type QueryFamilyMembersInput = z.infer<typeof queryFamilyMembersSchema>;
