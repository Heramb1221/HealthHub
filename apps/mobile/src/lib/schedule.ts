import type { MedicationSchedule } from "../api/types.ts";
import { isValidTimeOfDay } from "./validation.ts";

export interface NextReminder {
  at: Date;
  time: string;
  medicationName: string;
}

export function nextReminder(schedules: MedicationSchedule[], now: Date = new Date()): NextReminder | null {
  let best: NextReminder | null = null;
  for (const s of schedules) {
    if (!s.isActive || !s.remindersEnabled || !s.remindersActive) continue;
    if (s.endDate && new Date(`${s.endDate.slice(0, 10)}T23:59:59`).getTime() < now.getTime()) continue;
    for (const time of s.reminderTimes) {
      if (!isValidTimeOfDay(time)) continue;
      const [h, m] = time.split(":").map(Number) as [number, number];
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
      if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
      if (!best || at.getTime() < best.at.getTime()) best = { at, time, medicationName: s.medication.name ?? "Medicine" };
    }
  }
  return best;
}

export function enabledReminderTimes(schedules: MedicationSchedule[]): string[] {
  const set = new Set<string>();
  for (const s of schedules) {
    if (!s.isActive || !s.remindersEnabled || !s.remindersActive) continue;
    for (const t of s.reminderTimes) if (isValidTimeOfDay(t)) set.add(t);
  }
  return [...set].sort();
}
