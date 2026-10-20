
export type UserRole = "patient" | "admin" | "provider";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  expiresAt: string;
}

export type Gender = "female" | "male" | "other" | "prefer_not_to_say";
export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";

export interface Patient {
  id: string;
  healthId: string;
  fullName: string | null;

  dateOfBirth: string | null;
  gender: Gender | null;
  bloodGroup: BloodGroup | null;
  phone: string | null;
  email?: string | null;
  emergencyContact: { name: string | null; relationship?: string | null; phone: string | null };
  allergies: string[];
  existingConditions: string[];

  currentMedications: string[];
  address: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PatientUpdate {
  fullName?: string | null;
  dateOfBirth?: string | null;
  gender?: Gender | null;
  bloodGroup?: BloodGroup | null;
  phone?: string | null;
  emergencyContact?: { name?: string | null; relationship?: string | null; phone?: string | null };
  allergies?: string[];
  existingConditions?: string[];
  currentMedications?: string[];
  address?: string | null;
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

export interface HealthCard {
  healthId: string;
  fullName: string | null;
  dateOfBirth: string | null;
  bloodGroup: BloodGroup | null;
  issuer?: string;

  notice?: string;
  generatedAt?: string;
}

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

export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";
export type VerificationStatus = "unverified" | "needs_review" | "patient_corrected" | "verified_by_authorized_clinician";
export type PrescriptionSourceType = "uploaded_physical" | "clinician_issued";

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

  changedFields: string[];
  createdAt: string;
}

export type PrescriptionVersionSummary = PrescriptionVersion;

export type MedicationInput = Omit<PrescriptionMedication, "confidence"> & {

  confirmed?: boolean;
};

export interface CorrectionBody {
  baseVersionNumber: number;
  prescriptionDate?: string | null;
  prescriberName?: string | null;
  medications?: MedicationInput[];
}

export interface UploadFile {
  uri: string;
  name: string;
  mimeType: string;
}

export type ScheduleSourceStatus = "current" | "changed" | "removed";

export interface MedicationSchedule {
  id: string;
  prescriptionId: string;
  sourceVersionNumber: number;

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

  reminderTimes: string[];
  remindersEnabled: boolean;

  remindersActive: boolean;
  timezone: string;
  isActive: boolean;

  recentDoseEvents: DoseEvent[];

  notice: string;
  createdAt: string;
  updatedAt: string;
}

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

export interface UpdateScheduleBody {
  reminderTimes?: string[];
  remindersEnabled?: boolean;
  timezone?: string;
  endDate?: string | null;
  isActive?: boolean;
}

export type DoseStatus = "taken" | "skipped";

export interface DoseEventBody {
  scheduledFor: string;
  status: DoseStatus;
}

export interface DoseEvent {
  id: string;
  scheduleId?: string;
  scheduledFor: string;
  status: DoseStatus;
  recordedAt: string;
  selfReported: true;
}

export interface HistoryEntry {
  id: string;
  kind: string;
  title: string;
  notes: string | null;
  diagnosedOn: string | null;
  source: string;
  verificationStatus: string;
  createdAt: string;
  relatedPrescriptionId?: string | null;
  isDemo?: boolean;
}

export interface AddConditionBody {
  title: string;
  notes?: string | null;
  diagnosedOn?: string | null;
}

export interface CreateQrSessionBody {
  prescriptionId: string;
}

export interface QrSession {
  id: string;
  prescriptionId: string;
  qrPayload: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface QrLookup {
  session: { id: string; expiresAt: string };
  prescription: Prescription;
}

export interface Hospital {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  website?: string | null;
  timings?: string | null;
  locationUrl?: string | null;
  specialties?: string[];
  isActive?: boolean;
  isDemo?: boolean;
  ratingAverage?: number;
  reviewCount?: number;
}

export interface HospitalReview {
  id: string;
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

export interface AvailabilitySlot {
  id: string;
  startsAt: string;
  endsAt: string;
  status: "open" | "booked" | "holding" | "held_by_me";
  expiresAt?: string;
  secondsRemaining?: number;
}

export interface CreateAppointmentBody {
  slotId: string;
}

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

export interface RecordVaccinationBody {
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

export interface CreateFamilyMemberBody {
  fullName: string;
  relationship: FamilyRelationship;
  vitalStatus?: VitalStatus;
  age?: number | null;
  bloodGroup?: string | null;
  conditions?: string[];
  notes?: string | null;
}

export interface UpdateFamilyMemberBody {
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

export interface CreatePolicyBody {
  providerName: string;
  policyNumber: string;
  policyHolderName?: string;
  sumInsured?: string;
  validFrom?: string;
  validTill?: string;
  tpaContact?: string;
  notes?: string;
}

export interface CreatePaymentOrderBody {
  appointmentId: string;
  amountPaise?: number;
  currency?: "INR";
}

export interface PaymentOrder {
  id: string;
  orderRef: string;
  amountPaise: number;
  amountRupees: string;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded";
  isSandbox: boolean;
  hospitalName: string;
  slotTime: string;
  createdAt: string;
}

export interface VerifyPaymentBody {
  orderRef: string;
  paymentRef?: string;
  simulateFailure?: boolean;
}

export interface PaymentVerificationResult {
  id: string;
  orderRef: string;
  paymentRef: string | null;
  status: "completed" | "failed";
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
  hospitalName: string;
  appointmentTime: string | null;
  createdAt: string;
}
