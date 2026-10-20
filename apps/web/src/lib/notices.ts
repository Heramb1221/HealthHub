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

  action?: { href: string; label: string };
}

export function buildNotices(
  patient: Patient | null,
  prescriptions: Prescription[] | null,
  contraindications?: import("./api/types").ContraindicationReport | null,
): Notice[] {
  const notices: Notice[] = [];

  const latest = prescriptions?.[0];
  if (latest) {
    if (contraindications && contraindications.hasInteractions && contraindications.alerts.length > 0) {
      const hasHighRisk = contraindications.alerts.some((a) => a.severity === "high");
      notices.push({
        id: "rx-contraindications",
        tone: hasHighRisk ? "danger" : "warning",
        icon: ShieldAlert,
        title: hasHighRisk
          ? `${contraindications.alerts.length} medication interaction precaution${contraindications.alerts.length === 1 ? "" : "s"} detected`
          : `${contraindications.alerts.length} interaction caution${contraindications.alerts.length === 1 ? "" : "s"} detected`,
        body: "Safety precautions were identified between your prescribed medications. Review with your doctor or pharmacist.",
        action: { href: `/prescriptions/${latest.id}`, label: "View safety details" },
      });
    }

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
        title: unclear > 0 ? `${unclear} ${unclear === 1 ? "medicine detail can be checked" : "medicine details can be checked"}` : "Prescription saved to your records",
        body: "Medicines have been automatically added to your medication reminders. Check details against your paper prescription anytime.",
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
