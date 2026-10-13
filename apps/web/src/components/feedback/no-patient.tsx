import { UserRound } from "lucide-react";

import { EmptyState } from "@/components/feedback/states";
import { isApiError } from "@/lib/api/errors";

/** True when the API says the signed-in account has no patient record (for example the administrator account). */
export function isNoPatientError(error: unknown): boolean {
  return isApiError(error) && error.isNotFound && /patient profile/i.test(error.message);
}

export function NoPatientProfile() {
  return (
    <EmptyState
      icon={UserRound}
      title="This account has no patient profile"
      description="Patient records, reminders and appointments belong to patient accounts. Sign in with a patient account to see them."
    />
  );
}
