import type { AccessEvent } from "../api/types.ts";

export const SCOPE_LABEL: Record<string, string> = {
  "profile:read": "your profile",
  "prescriptions:read": "your prescriptions",
  "health_history:read": "your health history",
  "medication_schedules:read": "your medicine schedules",
};

export interface AccessDescription {
  text: string;
  tone: "neutral" | "warning" | "info";
}

export function describeAccessEvent(e: AccessEvent): AccessDescription {
  const scope = e.details?.resourceScope ? (SCOPE_LABEL[e.details.resourceScope] ?? e.details.resourceScope) : null;
  switch (e.action) {
    case "access.granted":
      return { text: `A provider you authorised viewed ${scope ?? "your records"}.`, tone: "info" };
    case "access.denied":
      return { text: `An attempt to access ${scope ?? "your records"} was blocked.`, tone: "warning" };
    case "consent.created":
      return { text: `You gave a provider access to ${scope ?? "your records"}.`, tone: "neutral" };
    case "consent.revoked":
      return { text: `You revoked a provider's access to ${scope ?? "your records"}.`, tone: "neutral" };
    case "qr.session_created":
      return { text: "You created a QR code for a prescription.", tone: "neutral" };
    case "qr.session_revoked":
      return { text: "You turned a QR code off.", tone: "neutral" };
    case "prescription.corrected":
      return { text: "You saved a correction to a prescription.", tone: "neutral" };
    case "prescription.pdf_downloaded":
      return { text: "You downloaded a prescription as a PDF.", tone: "neutral" };
    case "patient.profile_updated": {
      const fields = e.details?.changedFields?.length ? ` (${e.details.changedFields.join(", ")})` : "";
      return { text: `Your profile was updated${fields}.`, tone: "neutral" };
    }
    default:
      return { text: e.action.replace(/[._]/g, " "), tone: "neutral" };
  }
}
