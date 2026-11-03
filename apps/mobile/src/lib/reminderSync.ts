import { REMINDER_ID_PREFIX, type PlannedReminder } from "./schedule.ts";

export const REMINDER_TITLE = "Sehat Meds reminder";

/**
 * What a notification says. By default it names no medicine: notifications show on the lock screen, where anyone
 * nearby can read them. The patient can opt in to names; `data` never carries names either way.
 */
export function reminderContent(item: PlannedReminder, showMedicineNames: boolean) {
  return {
    title: REMINDER_TITLE,
    body: showMedicineNames ? `Time to take ${item.medicationName}. Open Sehat Meds to record it.` : "A dose is due. Open Sehat Meds to record it.",
    data: { scheduleId: item.scheduleId, scheduledFor: item.at.toISOString() },
  };
}

export interface ReminderDiff {
  /** Ours that are no longer wanted (schedule edited, paused, ended, deleted, or already past). */
  cancel: string[];
  /** Planned doses to (re)schedule. Re-adding an identifier replaces the old one, so it can never duplicate. */
  add: PlannedReminder[];
}

/**
 * Compare what the phone has scheduled with what should be scheduled. Only identifiers with our prefix are ever
 * cancelled, so other notifications the app owns are never touched. `force` re-adds everything (for example after
 * the "show medicine names" choice changes).
 */
export function diffReminders(existingIds: string[], plan: PlannedReminder[], force = false): ReminderDiff {
  const wanted = new Set(plan.map((p) => p.identifier));
  const have = new Set(existingIds.filter((id) => id.startsWith(REMINDER_ID_PREFIX)));
  return {
    cancel: [...have].filter((id) => !wanted.has(id)),
    add: force ? plan : plan.filter((p) => !have.has(p.identifier)),
  };
}
