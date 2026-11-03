
export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";

export type VerificationStatus = "unverified" | "needs_review" | "patient_corrected" | "verified_by_authorized_clinician";

export type PrescriptionSourceType = "uploaded_physical";

export interface PrescriptionMedication {
  name: string | null;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;

  confidence: number;

  source?: "extracted" | "patient_entered";
}

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

  isDemo?: boolean;

  sourceFile?: { fileName?: string; mimeType: string; sizeBytes: number } | null;
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

export interface ListResult<T> {
  items: T[];
}

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

export type Gender = "female" | "male" | "other" | "prefer_not_to_say";
export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";

export interface EmergencyContact {
  name: string | null;
  relationship: string | null;
  phone: string | null;
}

export interface Patient {
  id: string;

  healthId: string;
  fullName: string;

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

export interface Hospital {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
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

export type HospitalInput = Pick<Hospital, "name" | "city" | "address" | "phone" | "specialties"> & {
  website?: string | null;
  timings?: string | null;
  locationUrl?: string | null;
};
export type UpdateHospitalInput = Partial<HospitalInput>;

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

export interface BookAppointmentInput {
  hospitalId: string;
  slotId: string;
}

export interface DoseEvent {
  id: string;
  scheduleId: string;

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

  frequency: string | null;

  times: string[];

  startDate: string;
  endDate: string | null;
  /** IANA zone the reminder times are written in (e.g. "Asia/Kolkata"). Defaults to UTC for old/demo data. */
  timezone?: string;
  /** Whether reminders are switched on, and whether they are firing right now (in window, source unchanged). */
  remindersEnabled?: boolean;
  remindersActive?: boolean;
  /** "current" unless the prescription changed after this schedule was made. */
  sourceStatus?: "current" | "changed" | "removed";
  /** Version of the prescription this schedule was made from (needed to make another schedule). */
  sourceVersionNumber?: number;

  active: boolean;
  doseEvents?: DoseEvent[];
  isDemo?: boolean;
}

export interface CreateScheduleInput {
  prescriptionId: string;
  versionNumber?: number;

  medicationIndex: number;
  medicationName: string;

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

export type HistorySource = "patient_reported" | "prescription_scan";

export interface HistoryEntry {
  id: string;
  kind: "condition" | "prescription";
  title: string;
  description: string | null;

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
  /**
   * The version the patient was looking at. The API refuses the save (409) if someone changed the
   * record since, instead of silently overwriting. Required by the live API.
   */
  baseVersionNumber?: number;
  /** True when the patient ticked "I checked these details against my paper prescription". */
  confirmedByPatient?: boolean;
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

export interface HealthCard {
  healthId: string;
  fullName: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  bloodGroup?: string | null;
  phone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  issuer?: string;
  notice?: string;

  issuedAt: string;
  qr: {

    reference: string;

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

export type TriageUrgency = "emergency" | "urgent" | "routine" | "self_care";

export interface QuestionOption {
  id: string;
  label: string;
  isRedFlag?: boolean;
  indicatesSeverity?: "mild" | "moderate" | "severe";
  associatedCondition?: string;
}

export interface RuleQuestion {
  id: string;
  category: "duration" | "characteristics" | "red_flags" | "associated_symptoms" | "history";
  question: string;
  subtext?: string;
  options: QuestionOption[];
}

export interface SymptomAnswer {
  questionId: string;
  questionText: string;
  selectedOptionId: string;
  selectedOptionLabel: string;
}

export interface MatchedRuleDetail {
  ruleName: string;
  condition: string;
  reason: string;
}

export interface SymptomAssessmentInput {
  symptoms: string[];
  description?: string;
  durationDays?: number;
  severity?: "mild" | "moderate" | "severe";
  patientAge?: number;
  answers?: SymptomAnswer[];
}

export interface PossibleExplanation {
  condition: string;
  likelihood: "high" | "moderate" | "low" | "possible";
  description: string;
}

export interface SymptomAssessmentResult {
  urgency: TriageUrgency;
  urgencyLabel: string;
  redFlags: string[];
  possibleExplanations: PossibleExplanation[];
  matchedRules?: MatchedRuleDetail[];
  answeredQuestions?: SymptomAnswer[];
  recommendedAction: string;
  followUpQuestions: string[];
  clinicalDisclaimer: string;
  analyzedAt: string;
  provider: "clinical_rules" | "gemini_triage";
}

export interface InsuranceProviderInfo {
  id: string;
  name: string;
  code: string;
  type: "stand_alone_health" | "general_insurer" | "public_sector";
  cashlessHelpline: string;
  customerSupportPhone: string;
  website: string;
  tpaDeskEmail: string;
  popularPlans: string[];
  lastVerified: string;
}

export interface PatientInsurancePolicy {
  id: string;
  providerName: string;
  maskedPolicyNumber: string;
  rawPolicyNumberLastFour: string;
  policyHolderName: string | null;
  sumInsured: string | null;
  validFrom: string | null;
  validTill: string | null;
  tpaContact: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreatePolicyInput {
  providerName: string;
  policyNumber: string;
  policyHolderName?: string;
  sumInsured?: string;
  validFrom?: string;
  validTill?: string;
  tpaContact?: string;
  notes?: string;
}

/** The amount is decided by the server; the client sends only which appointment to pay for. */
export interface CreatePaymentOrderInput {
  appointmentId: string;
}

export type PaymentMode = "razorpay_test" | "razorpay_live" | "simulated" | "unavailable";

export interface PaymentConfig {
  mode: PaymentMode;
  keyId: string | null;
  isLiveRazorpay: boolean;
  currency: string;
  appointmentFeePaise: number;
  appointmentFeeRupees: string;
}

export interface PaymentOrder {
  id: string;
  /** True for development test orders: no gateway, no money moves. */
  simulated?: boolean;
  mode?: PaymentMode;
  orderRef: string;
  amountPaise: number;
  amountRupees: string;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded";
  isSandbox: boolean;
  keyId?: string | null;
  hospitalName: string;
  slotTime: string;
  patientName?: string;
  patientPhone?: string;
  createdAt: string;
}

export interface VerifyPaymentInput {
  orderRef: string;
  paymentRef?: string;
  signature?: string;
  /** Simulated test orders only. */
  simulate?: "success" | "failure";
}

export interface PaymentVerificationResult {
  id: string;
  orderRef: string;
  paymentRef: string | null;
  /** "pending" means the gateway has not confirmed the money yet; it is never shown as paid. */
  status: "completed" | "failed" | "pending";
  simulated?: boolean;
  receiptNumber: string | null;
  amountRupees: string;
  currency?: string;
  isSandbox: boolean;
  verifiedAt?: string;
}

export interface PaymentHistoryItem {
  id: string;
  orderRef: string;
  paymentRef: string | null;
  amountPaise: number;
  amountRupees: string;
  currency: string;
  status: string;
  isSandbox: boolean;
  simulated?: boolean;
  receiptNumber?: string | null;
  appointmentId?: string | null;
  hospitalName: string;
  appointmentTime: string | null;
  createdAt: string;
}

export interface CalendarStatus {
  isConfigured: boolean;
  connected: boolean;
  email?: string | null;
  provider?: "google_oauth" | "clerk" | null;
}

export interface CalendarSyncResult {
  /** Calendar events now in place (created or updated). */
  syncedCount: number;
  removedCount?: number;
  skippedCount?: number;
  failedCount?: number;
  events: Array<{
    medicationName: string;
    time: string;
    calendarLink?: string;
  }>;
}
