import type { LucideIcon } from "lucide-react";
import { CheckCircle2, CircleDashed, Clock, FileSearch, LoaderCircle, ShieldAlert, ShieldCheck, TriangleAlert, UserPen } from "lucide-react";

import type { ProcessingStatus, VerificationStatus } from "@/lib/api/types";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "demo";

export interface StatusDescriptor {
  label: string;
  /** One plain-language sentence explaining what the status means for the patient. */
  explanation: string;
  tone: StatusTone;
  icon: LucideIcon;
}

export const VERIFICATION_STATUS: Record<VerificationStatus, StatusDescriptor> = {
  unverified: {
    label: "Not verified",
    explanation: "Read automatically from your upload. Check it against your paper prescription before relying on it.",
    tone: "warning",
    icon: ShieldAlert,
  },
  needs_review: {
    label: "Needs your review",
    explanation: "Some details were unclear. Review and correct them against your paper prescription.",
    tone: "warning",
    icon: FileSearch,
  },
  patient_corrected: {
    label: "Corrected by you",
    explanation: "You edited these details. This is not a clinician's verification.",
    tone: "info",
    icon: UserPen,
  },
  verified_by_authorized_clinician: {
    label: "Verified by clinician",
    explanation: "An authorized clinician has verified this record.",
    tone: "success",
    icon: ShieldCheck,
  },
};

export const PROCESSING_STATUS: Record<ProcessingStatus, StatusDescriptor> = {
  pending: {
    label: "Waiting to be read",
    explanation: "Your file is uploaded and queued for reading.",
    tone: "neutral",
    icon: Clock,
  },
  processing: {
    label: "Reading document",
    explanation: "We're extracting the details from your file.",
    tone: "info",
    icon: LoaderCircle,
  },
  completed: {
    label: "Reading finished",
    explanation: "Extraction finished. Details still need your review.",
    tone: "success",
    icon: CheckCircle2,
  },
  failed: {
    label: "Couldn't read file",
    explanation: "We couldn't extract details. Try a clearer image or enter the details yourself.",
    tone: "danger",
    icon: TriangleAlert,
  },
};

export const DEMO_STATUS: StatusDescriptor = {
  label: "Demo data",
  explanation: "Sample record for demonstration. Not a real patient or prescription.",
  tone: "demo",
  icon: CircleDashed,
};
