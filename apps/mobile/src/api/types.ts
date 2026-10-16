/**
 * API types for the mobile client.
 *
 * SOURCE OF TRUTH: docs/API_CONTRACT.md. Each type carries a provenance tag:
 *   CONTRACT  - mirrors a shape written in docs/API_CONTRACT.md
 *   APPROVED  - backend decision note section A (approved by the integrator)
 *   PROPOSED  - backend decision note section B (not yet approved)
 *   SCHEMA    - field names taken from the backend Prisma schema (feat/api-core); response shape not yet confirmed
 *   ASSUMED   - mobile's working assumption where nothing is written down
 * Everything not CONTRACT/APPROVED is listed in docs/MOBILE_CONTRACT_ASSUMPTIONS.md and must be confirmed
 * (or replaced by packages/contracts) before integration. Optional fields are optional on purpose:
 * screens render what exists and never invent values.
 */

// ---------- Auth ----------
export type UserRole = "patient" | "admin" | "provider"; // APPROVED A4

/** PROPOSED B1 */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

/** PROPOSED B1 */
export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  expiresAt: string;
}

// ---------- Patient ----------
export type Gender = "female" | "male" | "other" | "prefer_not_to_say"; // BACKEND G3
export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-"; // BACKEND G3

/** BACKEND G2 (implemented; integrator confirmation pending). Unset values are null, lists empty. healthId is random. */
export interface Patient {
  id: string;
  healthId: string;
  fullName: string | null;
  /** Date only, YYYY-MM-DD. */
  dateOfBirth: string | null;
  gender: Gender | null;
  bloodGroup: BloodGroup | null;
  phone: string | null;
  emergencyContact: { name: string | null; phone: string | null };
  allergies: string[];
  existingConditions: string[];
  /** Self-reported (BACKEND G4). Never verified, never used for dose instructions. */
  currentMedications: string[];
  address: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * BACKEND G3: partial update; `null` clears a nullable field, a list replaces the stored list,
 * `emergencyContact` merges by sub-field. Unknown fields (healthId, role, ...) are rejected, so only these are sent.
 */
export interface PatientUpdate {
  fullName?: string | null;
  dateOfBirth?: string | null;
  gender?: Gender | null;
  bloodGroup?: BloodGroup | null;
  phone?: string | null;
  emergencyContact?: { name?: string | null; phone?: string | null };
  allergies?: string[];
  existingConditions?: string[];
  currentMedications?: string[];
  address?: string | null;
}

/** BACKEND G6: identity fields only. No allergies, conditions, medications, phone, address or emergency contact. */
export interface HealthCard {
  healthId: string;
  fullName: string | null;
  dateOfBirth: string | null;
  bloodGroup: BloodGroup | null;
  issuer?: string;
  /** Server-written statement that the health ID is a HealthHub identifier, not an official national ID. */
  notice?: string;
  generatedAt?: string;
}

/** BACKEND G7. `details` carries only: resourceScope, reason, changedFields, consentId, granteeUserId. */
export interface AccessEvent {
  id: string;
  occurredAt: string;
  action: string;
  outcome?: "success" | "denied" | "failure";
  actor?: { type: "self" } | { type: "provider"; userId: string } | { type: "other" };
  resourceType?: string | null;
  resourceId?: string | null;
  details?: { resourceScope?: string; reason?: string; changedFields?: string[]; consentId?: string; granteeUserId?: string };
}

/** BACKEND F3: consent object. Timestamps are ISO 8601 UTC. */
export interface Consent {
  id: string;
  patientId: string;
  granteeUserId: string;
  resourceScope: string;
  purpose: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

// ---------- Prescriptions ----------
export type ProcessingStatus = "pending" | "processing" | "completed" | "failed"; // CONTRACT
export type VerificationStatus = "unverified" | "needs_review" | "patient_corrected" | "verified_by_authorized_clinician"; // CONTRACT
export type PrescriptionSourceType = "uploaded_physical" | "clinician_issued"; // CONTRACT + PRODUCT_SPEC

/** CONTRACT: medication minimum fields. `confidence` is 0..1. */
export interface PrescriptionMedication {
  name: string | null;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  confidence: number;
}

/** CONTRACT: prescription object minimum fields. */
export interface Prescription {
  id: string;
  patientId: string;
  sourceType: PrescriptionSourceType;
  processingStatus: ProcessingStatus;
  verificationStatus: VerificationStatus;
  prescriptionDate: string | null;
  prescriberName: string | null;
  medications: PrescriptionMedication[];
  createdAt: string;
  updatedAt: string;
}

/** BACKEND I8/J1 (owner only): one stored version of a prescription. The newest one is what the record shows. */
export interface PrescriptionVersion {
  id: string;
  prescriptionId: string;
  versionNumber: number;
  kind: "extraction" | "patient_correction";
  verificationStatus: VerificationStatus;
  extractionProvider: string | null;
  extractionConfidence: number | null;
  prescriptionDate: string | null;
  prescriberName: string | null;
  medications: PrescriptionMedication[];
  /** Field names only, never values (J1). */
  changedFields: string[];
  createdAt: string;
}

/** Kept for list rows: the same object, only some fields are displayed. */
export type PrescriptionVersionSummary = PrescriptionVersion;

/** Medication input for a patient correction. Confidence is decided by the server (J1, K3). */
export type MedicationInput = Omit<PrescriptionMedication, "confidence"> & {
  /** BACKEND K3: "I checked this row against the original prescription". Raises an unchanged row to confidence 1. */
  confirmed?: boolean;
};

/**
 * BACKEND J1: PATCH /prescriptions/:id/extracted-fields. `baseVersionNumber` is the version the patient was looking at
 * (0 when none exists yet); a newer version makes the server answer 409. Omitted fields keep their value;
 * `medications`, when sent, replaces the whole list. The response is the NEW version (201), not the record.
 */
export interface CorrectionBody {
  baseVersionNumber: number;
  prescriptionDate?: string | null;
  prescriberName?: string | null;
  medications?: MedicationInput[];
}

/** File reference for multipart upload (React Native style file part). */
export interface UploadFile {
  uri: string;
  name: string;
  mimeType: string;
}

// ---------- Medication schedules and doses ----------
export type ScheduleSourceStatus = "current" | "changed" | "removed";

/** BACKEND K1/K6/K7. The medication text is a copy of the prescription row and is never edited here. */
export interface MedicationSchedule {
  id: string;
  prescriptionId: string;
  sourceVersionNumber: number;
  /** `changed`/`removed`: the prescription no longer says what this schedule was made from. */
  sourceStatus: ScheduleSourceStatus;
  medication: {
    name: string | null;
    strength: string | null;
    dose: string | null;
    route: string | null;
    frequency: string | null;
    duration: string | null;
    instructions: string | null;
  };
  startDate: string;
  endDate: string | null;
  /** Local "HH:MM" times. */
  reminderTimes: string[];
  remindersEnabled: boolean;
  /** The one flag clients use to decide whether to remind (K6). */
  remindersActive: boolean;
  timezone: string;
  isActive: boolean;
  /** Last 14 days, at most 20 (K7). */
  recentDoseEvents: DoseEvent[];
  /** Server wording: a reminder plan, not medical advice. */
  notice: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * BACKEND K2. The client names the exact prescription version and row the patient saw; the server copies the text,
 * and refuses with 409 unless a person has reviewed the version and the row is complete and confident.
 */
export interface CreateScheduleBody {
  prescriptionId: string;
  versionNumber: number;
  medicationPosition: number;
  startDate: string;
  endDate?: string | null;
  reminderTimes?: string[];
  remindersEnabled?: boolean;
  timezone: string;
}

/** BACKEND K5: only these can change; anything else is a 400. */
export interface UpdateScheduleBody {
  reminderTimes?: string[];
  remindersEnabled?: boolean;
  timezone?: string;
  endDate?: string | null;
  isActive?: boolean;
}

export type DoseStatus = "taken" | "skipped";

/** BACKEND K7 */
export interface DoseEventBody {
  scheduledFor: string;
  status: DoseStatus;
}

/** BACKEND K7: always self-reported, never verified. */
export interface DoseEvent {
  id: string;
  scheduleId?: string;
  scheduledFor: string;
  status: DoseStatus;
  recordedAt: string;
  selfReported: true;
}

// ---------- Health history ----------
/** BACKEND L5: entries are patient reported and never above "unverified". */
export interface HistoryEntry {
  id: string;
  kind: string;
  title: string;
  notes: string | null;
  diagnosedOn: string | null;
  source: string;
  verificationStatus: string;
  createdAt: string;
}

/** BACKEND L5: POST /health-history/conditions. Entries cannot be edited or deleted afterwards. */
export interface AddConditionBody {
  title: string;
  notes?: string | null;
  diagnosedOn?: string | null;
}

// ---------- QR ----------
/** BACKEND J3 */
export interface CreateQrSessionBody {
  prescriptionId: string;
}

/** BACKEND J3: `qrPayload` is a link with a random id and nothing medical. It is what the QR code encodes. */
export interface QrSession {
  id: string;
  prescriptionId: string;
  qrPayload: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

/** BACKEND J3: what a permitted reader gets back. */
export interface QrLookup {
  session: { id: string; expiresAt: string };
  prescription: Prescription;
}

// ---------- Hospitals and appointments ----------
/** SCHEMA (Hospital, PROVISIONAL). isDemo marks seeded demo rows. */
export interface Hospital {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  specialties?: string[];
  isActive?: boolean;
  isDemo?: boolean;
}

/** PROPOSED B3 */
export interface AvailabilitySlot {
  id: string;
  startsAt: string;
  endsAt: string;
  status: "open" | "booked";
}

/** PROPOSED B3 body: the patient comes from the session; the client never sends patient, price, or status. */
export interface CreateAppointmentBody {
  slotId: string;
}

/** BACKEND L4: flat shape. The hospital's `isDemo` must be shown as demo data. */
export interface Appointment {
  id: string;
  slotId: string;
  status: "confirmed" | "cancelled";
  hospital: { id: string; name: string; isDemo: boolean };
  startsAt: string;
  endsAt: string;
  cancelledAt: string | null;
  createdAt: string;
}
