import type { MedicationSchedule } from "../api/types.ts";
import { isValidTimeOfDay } from "./validation.ts";

export interface NextReminder {
  at: Date;
  time: string;
  medicationName: string;
}

/**
 * Next reminder time among active schedules that have reminders enabled, using the reminder times
 * the server stored. Display only: the app invents no times and decides nothing clinical.
 * Times are interpreted in the device's local time zone.
 */
export function nextReminder(schedules: MedicationSchedule[], now: Date = new Date()): NextReminder | null {
  let best: NextReminder | null = null;
  for (const s of schedules) {
    if (!s.isActive || !s.remindersEnabled) continue;
    if (s.endDate && new Date(`${s.endDate.slice(0, 10)}T23:59:59`).getTime() < now.getTime()) continue;
    for (const time of s.reminderTimes) {
      if (!isValidTimeOfDay(time)) continue;
      const [h, m] = time.split(":").map(Number) as [number, number];
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
      if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
      if (!best || at.getTime() < best.at.getTime()) best = { at, time, medicationName: s.medicationName };
    }
  }
  return best;
}

/** Distinct, sorted reminder times across schedules with reminders enabled. */
export function enabledReminderTimes(schedules: MedicationSchedule[]): string[] {
  const set = new Set<string>();
  for (const s of schedules) {
    if (!s.isActive || !s.remindersEnabled) continue;
    for (const t of s.reminderTimes) if (isValidTimeOfDay(t)) set.add(t);
  }
  return [...set].sort();
}
