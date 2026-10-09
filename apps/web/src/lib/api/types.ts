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
