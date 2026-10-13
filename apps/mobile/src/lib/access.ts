import type { AccessEvent } from "../api/types.ts";

const SCOPE_LABEL: Record<string, string> = {
  "profile:read": "your profile",
  "prescriptions:read": "your prescriptions",
  "health_history:read": "your health history",
  "medication_schedules:read": "your medicine schedules",
};

export interface AccessDescription {
  text: string;
  tone: "neutral" | "warning" | "info";
}

/** Plain-language line for an access-history event (backend note G7). Unknown actions fall back to the action name. */
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
    case "patient.profile_updated": {
      const fields = e.details?.changedFields?.length ? ` (${e.details.changedFields.join(", ")})` : "";
      return { text: `Your profile was updated${fields}.`, tone: "neutral" };
    }
    default:
      return { text: e.action.replace(/[._]/g, " "), tone: "neutral" };
  }
}
