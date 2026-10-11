import type { ProcessingStatus, VerificationStatus } from "../api/types.ts";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "demo";

export interface StatusDescriptor {
  label: string;
  /** One plain-language sentence explaining what the status means for the patient. */
  explanation: string;
  tone: StatusTone;
  /** Feather icon name (@expo/vector-icons). Status is always icon + text, never colour alone. */
  icon: string;
}

export const VERIFICATION_STATUS: Record<VerificationStatus, StatusDescriptor> = {
  unverified: {
    label: "Not verified",
    explanation: "Read automatically from your upload. Check it against your paper prescription before relying on it.",
    tone: "warning",
    icon: "alert-circle",
  },
  needs_review: {
    label: "Needs your review",
    explanation: "Some details were unclear. Review and correct them against your paper prescription.",
    tone: "warning",
    icon: "search",
  },
  patient_corrected: {
    label: "Corrected by you",
    explanation: "You edited these details. This is not a clinician's verification.",
    tone: "info",
    icon: "edit-3",
  },
  verified_by_authorized_clinician: {
    label: "Verified by clinician",
    explanation: "An authorized clinician has verified this record.",
    tone: "success",
    icon: "check-circle",
  },
};

export const PROCESSING_STATUS: Record<ProcessingStatus, StatusDescriptor> = {
  pending: { label: "Waiting to be read", explanation: "Your file is uploaded and queued for reading.", tone: "neutral", icon: "clock" },
  processing: { label: "Reading document", explanation: "Details are being extracted from your file.", tone: "info", icon: "loader" },
  completed: { label: "Reading finished", explanation: "Extraction finished. Details still need your review.", tone: "success", icon: "check" },
  failed: {
    label: "Couldn't read file",
    explanation: "Details could not be extracted. Try a clearer photo, or enter the details yourself.",
    tone: "danger",
    icon: "alert-triangle",
  },
};

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  uploaded_physical: "Scanned or photographed paper prescription",
  clinician_issued: "Issued digitally by a clinician",
};

export const DEMO_STATUS: StatusDescriptor = {
  label: "Demo data",
  explanation: "Sample record for demonstration. Not a real person or provider.",
  tone: "demo",
  icon: "info",
};

/** Verification labels for history entries, whose status strings are not yet contract-defined. */
export function describeHistoryVerification(value: string | undefined): StatusDescriptor | null {
  if (!value) return null;
  if (value in VERIFICATION_STATUS) return VERIFICATION_STATUS[value as VerificationStatus];
  return { label: value.replace(/_/g, " "), explanation: "", tone: "neutral", icon: "info" };
}
