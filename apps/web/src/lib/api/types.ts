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
}

/** ASSUMED: list responses. The contract does not define pagination. */
export interface ListResult<T> {
  items: T[];
}
