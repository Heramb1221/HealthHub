import type { LucideIcon } from "lucide-react";
import { FileSearch, ShieldAlert, TriangleAlert, UserRound } from "lucide-react";

import type { Patient, Prescription } from "@/lib/api/types";
import { medicationReviewReasons } from "@/lib/prescription-safety";
import type { StatusTone } from "@/lib/status";

export interface Notice {
  id: string;
  tone: StatusTone;
  icon: LucideIcon;
  title: string;
  body: string;
  /** Where to act on it. Only set for destinations that exist. */
  action?: { href: string; label: string };
}

/**
 * Notices are derived only from the state of the person's own records (never invented clinical alerts).
 * Each one says what is unfinished and why it matters.
 */
export function buildNotices(patient: Patient | null, prescriptions: Prescription[] | null): Notice[] {
  const notices: Notice[] = [];

  const latest = prescriptions?.[0];
  if (latest) {
    if (latest.processingStatus === "failed") {
      notices.push({
        id: "rx-failed",
        tone: "danger",
        icon: TriangleAlert,
        title: "Your latest prescription couldn’t be read",
        body: "Try reading it again, or upload a clearer image.",
        action: { href: `/prescriptions/${latest.id}`, label: "Open prescription" },
      });
    } else if (latest.processingStatus === "completed" && (latest.verificationStatus === "unverified" || latest.verificationStatus === "needs_review")) {
      const unclear = latest.medications.filter((m) => medicationReviewReasons(m).length > 0).length;
      notices.push({
        id: "rx-review",
        tone: "warning",
        icon: FileSearch,
        title: unclear > 0 ? `${unclear} ${unclear === 1 ? "medicine needs" : "medicines need"} your review` : "Your latest prescription isn’t verified",
        body: "Check the details against your paper prescription. Unclear medicines are kept out of your schedule until you do.",
        action: { href: `/prescriptions/${latest.id}`, label: "Review details" },
      });
    }
    if (!prescriptions?.some((p) => p.verificationStatus === "verified_by_authorized_clinician")) {
      notices.push({
        id: "no-clinician-verification",
        tone: "info",
        icon: ShieldAlert,
        title: "No prescription is clinician-verified",
        body: "Details read from your uploads, and any corrections you make, are not verified by a clinician.",
      });
    }
  }

  if (patient && !patient.emergencyContact.name && !patient.emergencyContact.phone) {
    notices.push({
      id: "no-emergency-contact",
      tone: "info",
      icon: UserRound,
      title: "Add an emergency contact",
      body: "It’s part of your profile and helps if someone needs to reach a person on your behalf.",
    });
  }

  return notices;
}
