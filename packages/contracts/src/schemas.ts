import { z } from "zod";

export const BloodGroupSchema = z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);

export const GenderSchema = z.enum(["male", "female", "other", "prefer_not_to_say"]);

export const EmergencyContactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  relationship: z.string().trim().max(50).optional(),
  phone: z.string().trim().min(5).max(20),
});

export const PatientProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(150).nullable().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").nullable().optional(),
  gender: GenderSchema.nullable().optional(),
  bloodGroup: BloodGroupSchema.nullable().optional(),
  phone: z.string().trim().min(5).max(20).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  emergencyContact: EmergencyContactSchema.nullable().optional(),
  allergies: z.array(z.string().trim().max(80)).max(50).optional(),
  existingConditions: z.array(z.string().trim().max(100)).max(50).optional(),
  currentMedicationsSummary: z.string().trim().max(500).nullable().optional(),
});

export const BookAppointmentSchema = z.object({
  hospitalId: z.string().uuid("Invalid hospital ID"),
  slotId: z.string().uuid("Invalid slot ID"),
});

export const SubmitHospitalReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().trim().max(500).optional(),
});

export const MedicationScheduleSchema = z.object({
  medicineName: z.string().trim().min(1).max(150),
  strength: z.string().trim().max(50).nullable().optional(),
  dose: z.string().trim().min(1).max(50),
  route: z.string().trim().min(1).max(50).default("Oral"),
  frequency: z.string().trim().min(1).max(100),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM")).min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").nullable().optional(),
  instructions: z.string().trim().max(300).nullable().optional(),
});

export const DoseEventSchema = z.object({
  scheduledTime: z.string().datetime(),
  status: z.enum(["taken", "skipped"]),
  notes: z.string().trim().max(200).nullable().optional(),
});
