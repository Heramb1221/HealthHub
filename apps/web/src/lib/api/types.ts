/**
 * Shared API types.
 *
 * SOURCE OF TRUTH: docs/API_CONTRACT.md. Types marked CONTRACT mirror a documented shape.
 * Types marked ASSUMED are the web app's working assumption where the contract is silent;
 * they must be replaced by packages/contracts (or confirmed by the backend owner) before integration.
 */

/** CONTRACT: Prescription object minimum fields. */
export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";

/** CONTRACT */
export type VerificationStatus = "unverified" | "needs_review" | "patient_corrected" | "verified_by_authorized_clinician";

/** CONTRACT (only value the contract lists; PRODUCT_SPEC says clinician_issued is allowed only when supported) */
export type PrescriptionSourceType = "uploaded_physical";

/** CONTRACT */
export interface PrescriptionMedication {
  name: string | null;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  /** 0.0 to 1.0 */
  confidence: number;
  /**
   * ASSUMED extension: who produced this value. "patient_entered" values were typed by the patient
   * (a correction, not clinician verification). Absent means read automatically from the upload.
   */
  source?: "extracted" | "patient_entered";
}

/** CONTRACT */
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
  /** ASSUMED extension (not in the contract): set on sample records so the UI can label them. */
  isDemo?: boolean;
  /**
   * ASSUMED extension: the spec requires an original file reference, but the contract returns none.
   * Metadata only; there is no endpoint to fetch the file itself yet.
   */
  sourceFile?: { fileName: string; mimeType: string; sizeBytes: number } | null;
}

export type AlertSeverity = "high" | "moderate" | "low";

export interface ContraindicationAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  medications: string[];
  mechanism: string;
  patientAdvice: string;
  clinicalNote: string;
}

export interface ContraindicationReport {
  prescriptionId: string;
  hasInteractions: boolean;
  alerts: ContraindicationAlert[];
  summary: string;
  disclaimer: string;
  analyzedAt: string;
}

/** ASSUMED: list responses. The contract does not define pagination. */
export interface ListResult<T> {
  items: T[];
}

/**
 * ASSUMED: auth shapes. docs/API_CONTRACT.md lists POST /auth/register, /auth/login, /auth/logout
 * but defines no request or response bodies, and has no "who am I" endpoint.
 * Open contract questions for the backend owner:
 *   1. Request bodies for register and login (assumed below).
 *   2. Response body (assumed: the AuthUser, bare or wrapped as { user }).
 *   3. A GET /auth/me (assumed) so the web app can learn the signed-in user and role after a reload.
 * The role is informational for navigation only. The server enforces every permission.
 */
export type UserRole = "patient" | "admin" | "provider" | "staff";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
}

/**
 * ASSUMED: patient profile. Contract has GET/PATCH /patients/me with no body defined.
 * Field list follows docs/PRODUCT_SPEC.md "Patient profile". Photo is optional in the spec and is not built yet.
 * `isDemo` is an assumed optional flag the demo adapter sets (and the backend may set on seeded data)
 * so the UI can label sample records in place.
 */
export type Gender = "female" | "male" | "other" | "prefer_not_to_say";
export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";

export interface EmergencyContact {
  name: string | null;
  relationship: string | null;
  phone: string | null;
}

export interface Patient {
  id: string;
  /** Random, non-meaningful display identifier (spec). Read-only for clients. */
  healthId: string;
  fullName: string;
  /** ISO date, YYYY-MM-DD */
  dateOfBirth: string | null;
  gender: Gender | null;
  bloodGroup: BloodGroup | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  emergencyContact: EmergencyContact;
  allergies: string[];
  conditions: string[];
  currentMedications: string[];
  isDemo?: boolean;
}

export type UpdatePatientInput = Partial<Omit<Patient, "id" | "healthId" | "email" | "isDemo">>;

/**
 * ASSUMED: hospitals, availability and appointments. Contract: GET /hospitals, GET /hospitals/:id,
 * GET /hospitals/:id/availability, POST /appointments, GET /appointments, POST /appointments/:id/cancel.
 * No bodies are defined. Open questions for the backend owner:
 *   1. Hospital fields (assumed below). Nothing here may be invented by the UI: no ratings, no doctors, no credentials.
 *   2. Whether GET /hospitals returns inactive hospitals to patients. The UI hides them and shows
 *      "not accepting appointments" on a direct link, but the server should not offer them.
 *   3. Availability returns open, future slots only (assumed). Each slot has a stable ID.
 *   4. POST /appointments body is { hospitalId, slotId }. The SERVER must check the slot is still open and use a
 *      transaction or unique constraint so two people can never hold the same slot. On a lost race it should answer
 *      409 so the UI can say the time was just taken. The web app never decides availability.
 *   5. Whether the hospital receives anything about the patient (name? contact?). The UI makes no such claim.
 */
export interface Hospital {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  specialties: string[];
  /** false = deactivated by an administrator */
  active: boolean;
  isDemo?: boolean;
}

/**
 * ASSUMED: admin hospital management. Contract: POST /admin/hospitals, PATCH /admin/hospitals/:id,
 * POST /admin/hospitals/:id/deactivate. Open questions for the backend owner:
 *   1. Bodies (assumed below). The SERVER must check the caller's role on every one of these; the web app hides
 *      the portal from non-admins only as a courtesy.
 *   2. There is no admin list endpoint. The web app assumes GET /hospitals returns deactivated hospitals too when
 *      the caller is an administrator (and only active ones for patients).
 *   3. There is no way to reactivate a hospital, and no admin endpoints to create or change appointment slots.
 *      The portal therefore offers a read-only view of open times and no reactivate button.
 *   4. Whether deactivating cancels or keeps existing appointments (the demo keeps them).
 *   5. Administrators must not be able to read patient records or see who booked a slot (spec: hospital-admin
 *      permissions do not imply access to medical records). The portal shows open times only.
 */
export type HospitalInput = Pick<Hospital, "name" | "city" | "address" | "phone" | "specialties">;
export type UpdateHospitalInput = Partial<HospitalInput>;

export interface AvailabilitySlot {
  id: string;
  hospitalId: string;
  startsAt: string;
  endsAt: string;
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

export interface BookAppointmentInput {
  hospitalId: string;
  slotId: string;
}

/**
 * ASSUMED: medication schedules and dose events. The contract lists GET/POST/PATCH /medication-schedules and
 * POST /medication-schedules/:id/dose-events, with no bodies. Open questions for the backend owner:
 *   1. Create body (assumed: CreateScheduleInput). The server MUST re-check that the chosen medicine is complete
 *      and confident enough; the web app also checks, but never trusts itself.
 *   2. There is no endpoint to list dose events. The web app assumes each schedule carries its recent events
 *      (about the last 14 days) in `doseEvents`.
 *   3. Dose events are self-reported by the patient. They are not clinical records and not adherence advice.
 */
export interface DoseEvent {
  id: string;
  scheduleId: string;
  /** The reminder slot this refers to, as an ISO timestamp. */
  scheduledFor: string;
  status: "taken" | "skipped";
  recordedAt: string;
}

export interface MedicationSchedule {
  id: string;
  prescriptionId: string | null;
  medicationName: string;
  strength: string | null;
  dose: string;
  /** The frequency text from the prescription, shown beside the patient's chosen times. */
  frequency: string | null;
  /** Local clock times, "HH:mm" */
  times: string[];
  /** ISO dates, YYYY-MM-DD */
  startDate: string;
  endDate: string | null;
  /** Reminders on or paused. Pausing never deletes the schedule or its history. */
  active: boolean;
  doseEvents?: DoseEvent[];
  isDemo?: boolean;
}

export interface CreateScheduleInput {
  prescriptionId: string;
  /** Position in the prescription's current medication list. The server verifies it. */
  medicationIndex: number;
  medicationName: string;
  /**
   * ASSUMED: true when the patient ticked "I've checked this against my paper prescription". The web app requires it
   * unless the values were typed by the patient or verified by a clinician; the server may record it for audit.
   */
  confirmedAgainstPaper: boolean;
  times: string[];
  startDate: string;
  endDate: string | null;
}

export interface UpdateScheduleInput {
  times?: string[];
  endDate?: string | null;
  active?: boolean;
}

export interface DoseEventInput {
  scheduledFor: string;
  status: DoseEvent["status"];
}

/**
 * ASSUMED: medical history. Contract: GET /health-history and POST /health-history/conditions, no bodies.
 * Assumed: the log mixes patient-reported conditions and entries the server derives from prescription records,
 * each with a source and a verification status (spec: "Medical history log with source and verification status").
 * Open question: is `Patient.conditions` (profile) the same data as condition entries here?
 */
export type HistorySource = "patient_reported" | "prescription_scan";

export interface HistoryEntry {
  id: string;
  kind: "condition" | "prescription";
  title: string;
  description: string | null;
  /** ISO date the event happened or the condition began, when known. */
  occurredOn: string | null;
  source: HistorySource;
  verificationStatus: VerificationStatus;
  relatedPrescriptionId: string | null;
  createdAt: string;
  isDemo?: boolean;
}

export interface AddConditionInput {
  name: string;
  diagnosedOn: string | null;
  notes: string | null;
}

/**
 * ASSUMED: prescription workflow shapes. The contract lists the routes but defines no bodies except the
 * Prescription object itself. Open questions for the backend owner:
 *   1. POST /prescriptions multipart field names (assumed: file, prescriptionDate, prescriberName) and whether
 *      upload starts processing automatically (assumed yes; POST /:id/process is used only to retry).
 *   2. GET /:id/versions item shape (assumed below: a full snapshot per version, so the UI can show what changed).
 *   3. PATCH /:id/extracted-fields body (assumed: CorrectionInput) and that the server marks patient-entered
 *      values `source: "patient_entered"` and sets verificationStatus to "patient_corrected".
 *   4. A file endpoint (e.g. GET /:id/file) so the original can be shown next to the extracted values.
 */
export interface UploadInput {
  file: File;
  prescriptionDate?: string | null;
  prescriberName?: string | null;
}

export interface UploadResult {
  id: string;
  processingStatus: ProcessingStatus;
}

export type CorrectedMedication = Omit<PrescriptionMedication, "confidence" | "source">;

export interface CorrectionInput {
  prescriptionDate: string | null;
  prescriberName: string | null;
  medications: CorrectedMedication[];
}

export interface PrescriptionVersion {
  id: string;
  versionNumber: number;
  kind: "extraction" | "patient_correction";
  createdAt: string;
  verificationStatus: VerificationStatus;
  prescriptionDate: string | null;
  prescriberName: string | null;
  medications: PrescriptionMedication[];
}

/**
 * ASSUMED: digital health card. Contract: GET /patients/me/health-card (no body defined) and the QR access routes
 * POST /qr/access-sessions, GET /qr/access-sessions/:sessionId (used by whoever scans, not by the patient web app).
 *
 * The QR text is `qr.url`: a random reference URL, never medical data and never a long-lived bearer secret
 * (docs/PRODUCT_SPEC.md). The web app renders it exactly as given and must not add anything to it.
 *
 * Open questions for the backend owner:
 *   1. The card body (assumed below). Kept to name, HealthHub ID and QR on purpose: least data on screen.
 *   2. Patient-side controls are missing from the contract: list who has accessed the record, end an active session,
 *      withdraw consent, and view the audit trail. Without them the web app can only explain the flow.
 *   3. Whether the QR reference can be rotated by the patient (e.g. a lost phone).
 */
export interface HealthCard {
  healthId: string;
  fullName: string;
  /** ISO timestamp the card (and its QR reference) was issued */
  issuedAt: string;
  qr: {
    /** The random reference. Safe to show. */
    reference: string;
    /** Exactly what is encoded in the QR image. */
    url: string;
  };
  isDemo?: boolean;
}

export type VaccineCategory = "uip" | "iap_private" | "covid19" | "special_travel" | "custom";
export type VaccinationStatus = "taken" | "not_taken";

export interface PatientVaccination {
  recordId: string | null;
  vaccineId: string | null;
  vaccineName: string;
  category: VaccineCategory;
  categoryLabel: string;
  description: string;
  status: VaccinationStatus | null;
  administeredDate: string | null;
  notes: string | null;
  isCustom: boolean;
  updatedAt: string | null;
}

export interface VaccinationSummary {
  total: number;
  taken: number;
  notTaken: number;
  unrecorded: number;
}

export interface VaccinationListResult {
  data: PatientVaccination[];
  summary: VaccinationSummary;
}

export interface RecordVaccinationInput {
  vaccineName: string;
  vaccineId?: string | null;
  category?: VaccineCategory;
  status: VaccinationStatus;
  administeredDate?: string | null;
  notes?: string | null;
}

export type FamilyRelationship =
  | "father"
  | "mother"
  | "spouse"
  | "brother"
  | "sister"
  | "son"
  | "daughter"
  | "paternal_grandfather"
  | "paternal_grandmother"
  | "maternal_grandfather"
  | "maternal_grandmother"
  | "other";

export type VitalStatus = "alive" | "deceased" | "unknown";

export type Generation = "grandparents" | "parents" | "current" | "children" | "other";

export interface FamilyMember {
  id: string;
  fullName: string;
  relationship: FamilyRelationship;
  relationshipLabel: string;
  generation: Generation;
  vitalStatus: VitalStatus;
  age: number | null;
  bloodGroup: string | null;
  conditions: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HereditaryRiskSummary {
  condition: string;
  count: number;
  members: { name: string; relationship: string; relationLabel: string }[];
}

export interface FamilyTreeResult {
  data: FamilyMember[];
  generations: {
    grandparents: FamilyMember[];
    parents: FamilyMember[];
    current: FamilyMember[];
    children: FamilyMember[];
    other: FamilyMember[];
  };
  hereditaryRisks: HereditaryRiskSummary[];
  totalMembers: number;
}

export interface CreateFamilyMemberInput {
  fullName: string;
  relationship: FamilyRelationship;
  vitalStatus?: VitalStatus;
  age?: number | null;
  bloodGroup?: string | null;
  conditions?: string[];
  notes?: string | null;
}

export interface UpdateFamilyMemberInput {
  fullName?: string;
  relationship?: FamilyRelationship;
  vitalStatus?: VitalStatus;
  age?: number | null;
  bloodGroup?: string | null;
  conditions?: string[];
  notes?: string | null;
}
