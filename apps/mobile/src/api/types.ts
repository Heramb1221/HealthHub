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

/** BACKEND I8 (owner only). Only the fields the app displays are typed. */
export interface PrescriptionVersionSummary {
  id: string;
  versionNumber: number;
  kind?: "extraction" | "patient_correction";
  verificationStatus?: VerificationStatus;
  extractionProvider?: string | null;
  changedFields?: string[];
  createdAt: string;
}

/** ASSUMED medication input for a patient correction. Confidence is decided by the server (backend note E5). */
export type MedicationInput = Omit<PrescriptionMedication, "confidence">;

/** ASSUMED: PATCH /prescriptions/:id/extracted-fields replaces the extracted fields with a new version. */
export interface ExtractedFieldsUpdate {
  prescriptionDate: string | null;
  prescriberName: string | null;
  medications: MedicationInput[];
}

/** File reference for multipart upload (React Native style file part). */
export interface UploadFile {
  uri: string;
  name: string;
  mimeType: string;
}

// ---------- Medication schedules and doses ----------
/** SCHEMA (MedicationSchedule, marked PROVISIONAL by the backend). */
export interface MedicationSchedule {
  id: string;
  medicationName: string;
  dose: string;
  frequency: string;
  startDate: string;
  endDate?: string | null;
  /** "HH:mm" strings. */
  reminderTimes: string[];
  remindersEnabled: boolean;
  timezone?: string;
  isActive: boolean;
}

/**
 * ASSUMED: the client names the prescription and the medication position only; the server derives
 * name/dose/frequency from the latest stored version and refuses incomplete or ambiguous ones.
 * The client never sends dose text for a schedule.
 */
export interface CreateScheduleBody {
  prescriptionId: string;
  medicationIndex: number;
  startDate: string;
  timezone: string;
}

/** ASSUMED: editable reminder preferences. */
export interface UpdateScheduleBody {
  remindersEnabled?: boolean;
  reminderTimes?: string[];
  isActive?: boolean;
}

export type DoseStatus = "taken" | "skipped";

/** PROPOSED B4 */
export interface DoseEventBody {
  scheduledFor: string;
  status: DoseStatus;
}

/** PROPOSED B4: responses label the event as self-reported. */
export interface DoseEvent {
  id?: string;
  scheduledFor: string;
  status: DoseStatus;
  reportedAt?: string;
  selfReported?: boolean;
}

// ---------- Health history ----------
/** ASSUMED: GET /health-history returns a log of entries with source and verification labels. */
export interface HistoryEntry {
  id: string;
  title: string;
  kind?: string;
  notes?: string | null;
  recordedAt?: string | null;
  source?: string;
  verificationStatus?: string;
}

/** ASSUMED: POST /health-history/conditions body. */
export interface AddConditionBody {
  name: string;
  notes?: string;
}

// ---------- QR ----------
/** PROPOSED B5 */
export interface CreateQrSessionBody {
  prescriptionId: string;
}

/** PROPOSED B5: random reference and expiry, never medical data. `url`/`reference` are ASSUMED field names. */
export interface QrSession {
  id: string;
  expiresAt: string;
  url?: string;
  reference?: string;
}

/** ASSUMED: scope-limited lookup result. */
export interface QrLookup {
  status?: string;
  expiresAt?: string;
  prescription?: Partial<Prescription>;
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

/** SCHEMA (Appointment) + ASSUMED embedded slot/hospital labels. */
export interface Appointment {
  id: string;
  slotId: string;
  status: "confirmed" | "cancelled";
  createdAt?: string;
  startsAt?: string;
  endsAt?: string;
  slot?: { startsAt: string; endsAt: string; hospitalId?: string };
  hospital?: { id?: string; name: string; isDemo?: boolean };
  hospitalName?: string;
}
