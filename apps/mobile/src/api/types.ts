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
/** SCHEMA (Patient model). healthId is a random display identifier, not meaningful. */
export interface Patient {
  id: string;
  healthId: string;
  fullName?: string | null;
  /** ISO date or date-time; render only the date part. */
  dateOfBirth?: string | null;
  gender?: string | null;
  bloodGroup?: string | null;
  phone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  allergies?: string[];
  existingConditions?: string[];
  currentMedications?: string[];
  address?: string | null;
}

/** ASSUMED: PATCH /patients/me accepts a partial of the editable profile fields. Server validates. */
export type PatientUpdate = Partial<
  Pick<
    Patient,
    | "fullName"
    | "dateOfBirth"
    | "gender"
    | "bloodGroup"
    | "phone"
    | "emergencyContactName"
    | "emergencyContactPhone"
    | "allergies"
    | "existingConditions"
    | "currentMedications"
    | "address"
  >
>;

/** ASSUMED: GET /patients/me/health-card returns identity/emergency fields only. Renders whatever is present. */
export type HealthCard = Partial<
  Pick<Patient, "healthId" | "fullName" | "dateOfBirth" | "gender" | "bloodGroup" | "emergencyContactName" | "emergencyContactPhone" | "allergies">
> & { demo?: boolean };

/** SCHEMA (AuditEvent). Field names only; the server must never include medical values here. */
export interface AccessEvent {
  id: string;
  occurredAt: string;
  action: string;
  outcome?: "success" | "denied" | "failure";
  resourceType?: string | null;
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

/** SCHEMA (PrescriptionVersion). Names only; values are not needed on the version list. */
export interface PrescriptionVersionSummary {
  id: string;
  versionNumber: number;
  kind?: "extraction" | "patient_correction";
  verificationStatus?: VerificationStatus;
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
