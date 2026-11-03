import type { DoseStatus, MedicationSchedule } from "../api/types.ts";
import { isValidTimeOfDay } from "./validation.ts";
import { addDays, dateInZone, isValidTimeZone, zonedInstant } from "./zonedTime.ts";

export interface NextReminder {
  at: Date;
  time: string;
  medicationName: string;
}

export interface PlannedReminder {
  /** Stable per dose: scheduling the same dose twice replaces it instead of duplicating it. */
  identifier: string;
  at: Date;
  time: string;
  scheduleId: string;
  medicationName: string;
}

/** Operating systems cap pending local notifications (iOS: 64). Stay under it and re-plan whenever the app opens. */
export const MAX_PLANNED_REMINDERS = 60;
export const PLAN_HORIZON_DAYS = 14;
export const REMINDER_ID_PREFIX = "sehat-med:";

/** The zone a schedule's times are written in; old data without one falls back to this device's zone. */
export function scheduleZone(schedule: Pick<MedicationSchedule, "timezone">): string {
  if (schedule.timezone && isValidTimeZone(schedule.timezone)) return schedule.timezone;
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return device && isValidTimeZone(device) ? device : "UTC";
}

/** Reminders only fire for schedules that are on, not paused, and still match the prescription they came from. */
export function remindersLive(schedule: MedicationSchedule): boolean {
  return schedule.isActive && schedule.remindersEnabled && schedule.remindersActive;
}

function dayInRange(schedule: MedicationSchedule, ymd: string): boolean {
  if (ymd < schedule.startDate.slice(0, 10)) return false;
  return !schedule.endDate || ymd <= schedule.endDate.slice(0, 10);
}

/**
 * The exact upcoming reminders, soonest first. Each dose is computed in its schedule's own time zone
 * (daylight-saving aware), only inside the schedule's start/end days, and never in the past, so a finished or
 * paused schedule contributes nothing and cannot keep notifying.
 */
export function planReminders(
  schedules: MedicationSchedule[],
  now: Date = new Date(),
  options: { limit?: number; horizonDays?: number } = {},
): PlannedReminder[] {
  const limit = options.limit ?? MAX_PLANNED_REMINDERS;
  const horizon = options.horizonDays ?? PLAN_HORIZON_DAYS;
  const planned: PlannedReminder[] = [];
  for (const schedule of schedules) {
    if (!remindersLive(schedule)) continue;
    const zone = scheduleZone(schedule);
    const today = dateInZone(now, zone);
    const times = [...new Set(schedule.reminderTimes)].filter(isValidTimeOfDay);
    for (let offset = 0; offset <= horizon; offset += 1) {
      const ymd = addDays(today, offset);
      if (!dayInRange(schedule, ymd)) continue;
      for (const time of times) {
        const at = zonedInstant(ymd, time, zone);
        if (!at || at.getTime() <= now.getTime()) continue;
        planned.push({
          identifier: `${REMINDER_ID_PREFIX}${schedule.id}:${Math.floor(at.getTime() / 60_000)}`,
          at,
          time,
          scheduleId: schedule.id,
          medicationName: schedule.medication.name ?? "Medicine",
        });
      }
    }
  }
  planned.sort((a, b) => a.at.getTime() - b.at.getTime() || a.identifier.localeCompare(b.identifier));
  return planned.slice(0, limit);
}

export function nextReminder(schedules: MedicationSchedule[], now: Date = new Date()): NextReminder | null {
  const first = planReminders(schedules, now, { limit: 1 })[0];
  return first ? { at: first.at, time: first.time, medicationName: first.medicationName } : null;
}

export interface DoseSlot {
  /** The instant sent to the API as `scheduledFor`. */
  iso: string;
  at: Date;
  time: string;
  /** "today" or "yesterday" in the schedule's own zone. */
  day: "today" | "yesterday";
  status: DoseStatus | undefined;
  /** Due now (or within the hour): the server refuses doses reported more than an hour early. */
  canRecord: boolean;
  /** Past its time with no answer recorded yet. */
  missed: boolean;
}

/**
 * Today's and yesterday's dose slots for one schedule, in the schedule's own zone, each matched to any answer the
 * patient already recorded. Yesterday is included so a dose that was forgotten can still be recorded honestly.
 */
export function doseSlots(schedule: MedicationSchedule, now: Date = new Date()): DoseSlot[] {
  const zone = scheduleZone(schedule);
  const today = dateInZone(now, zone);
  const times = [...new Set(schedule.reminderTimes)].filter(isValidTimeOfDay).sort();
  const slots: DoseSlot[] = [];
  for (const [ymd, day] of [[addDays(today, -1), "yesterday"], [today, "today"]] as const) {
    if (!dayInRange(schedule, ymd)) continue;
    for (const time of times) {
      const at = zonedInstant(ymd, time, zone);
      if (!at) continue;
      const minute = Math.floor(at.getTime() / 60_000);
      const event = schedule.recentDoseEvents.find((e) => Math.floor(Date.parse(e.scheduledFor) / 60_000) === minute);
      const status = event ? (event.status as DoseStatus) : undefined;
      slots.push({
        iso: at.toISOString(),
        at,
        time,
        day,
        status,
        canRecord: schedule.isActive && at.getTime() <= now.getTime() + 60 * 60_000,
        missed: !status && at.getTime() < now.getTime(),
      });
    }
  }
  return slots;
}
