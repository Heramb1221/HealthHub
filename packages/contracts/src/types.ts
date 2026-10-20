
export type Role = "patient" | "admin" | "provider";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  fullName?: string | null;
  patientId?: string | null;
}

export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";

export type Gender = "male" | "female" | "other" | "prefer_not_to_say";

export interface Patient {
  id: string;
  userId: string;
  healthId: string;
  fullName: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  bloodGroup: BloodGroup | null;
  phone: string | null;
  address: string | null;
  emergencyContact: {
    name: string;
    relationship?: string;
    phone: string;
  } | null;
  allergies: string[];
  existingConditions: string[];
  currentMedicationsSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PrescriptionSourceType = "uploaded_physical" | "clinician_issued";

export type PrescriptionProcessingStatus = "pending" | "processing" | "completed" | "failed";

export type PrescriptionVerificationStatus =
  | "unverified"
  | "needs_review"
  | "patient_corrected"
  | "verified_by_authorized_clinician";

export interface PrescriptionMedicine {
  id?: string;
  name: string | null;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  confidence: number;
}

export interface PrescriptionRecord {
  id: string;
  patientId: string;
  sourceType: PrescriptionSourceType;
  processingStatus: PrescriptionProcessingStatus;
  verificationStatus: PrescriptionVerificationStatus;
  prescriptionDate: string | null;
  prescriberName: string | null;
  medications: PrescriptionMedicine[];
  originalStorageKey?: string;
  originalMimeType?: string;
  originalFileName?: string;
  originalFileSize?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Hospital {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  website?: string | null;
  timings?: string | null;
  locationUrl?: string | null;
  specialties: string[];
  ratingAverage?: number;
  reviewCount?: number;
  active: boolean;
  isActive?: boolean;
  isDemo?: boolean;
}

export interface AvailabilitySlot {
  id: string;
  hospitalId: string;
  startsAt: string;
  endsAt: string;
  status?: "open" | "booked" | "holding" | "held_by_me";
  expiresAt?: string;
  secondsRemaining?: number;
}

export interface Appointment {
  id: string;
  hospitalId: string;
  hospitalName: string;
  startsAt: string;
  endsAt?: string | null;
  status: "booked" | "cancelled" | "completed";
  isDemo?: boolean;
}

export interface MedicationSchedule {
  id: string;
  patientId: string;
  prescriptionId?: string | null;
  medicineName: string;
  strength?: string | null;
  dose: string;
  route: string;
  frequency: string;
  times: string[];
  startDate: string;
  endDate?: string | null;
  instructions?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DoseEvent {
  id: string;
  scheduleId: string;
  scheduledTime: string;
  recordedAt: string;
  status: "taken" | "skipped";
  notes?: string | null;
}

export interface HospitalReview {
  id: string;
  hospitalId?: string;
  patientId?: string;
  rating: number;
  reviewText: string | null;
  isVerifiedPatient: boolean;
  createdAt: string;
  patientName: string;
}

export interface HospitalReviewsResult {
  ratingAverage: number;
  reviewCount: number;
  userReview?: HospitalReview | null;
  reviews: HospitalReview[];
}
