import type { DoseEvent, MedicationSchedule, Prescription } from "@/lib/api/types";
import { isInstructionSafe } from "@/lib/prescription-safety";
import { addDays, dateInZone, isValidTimeZone, zonedInstant } from "@/lib/zoned-time";

export interface UpcomingReminder {
  schedule: MedicationSchedule;
  at: Date;
}

export interface DoseSlot {
  schedule: MedicationSchedule;
  at: Date;

  event: DoseEvent | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The zone a schedule's times are written in. Old or demo data without one falls back to this device's zone. */
export function scheduleZone(schedule: MedicationSchedule): string {
  if (schedule.timezone && isValidTimeZone(schedule.timezone)) return schedule.timezone;
  const device = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  return device && isValidTimeZone(device) ? device : "UTC";
}

/** Start and end are calendar days in the schedule's own zone, so they are compared as plain dates, never as instants. */
function dayInRange(schedule: MedicationSchedule, ymd: string): boolean {
  if (ymd < schedule.startDate.slice(0, 10)) return false;
  if (schedule.endDate && ymd > schedule.endDate.slice(0, 10)) return false;
  return true;
}

export function eventForSlot(schedule: MedicationSchedule, at: Date): DoseEvent | null {
  const minute = Math.floor(at.getTime() / 60_000);
  const matches = (schedule.doseEvents ?? []).filter((e) => Math.floor(new Date(e.scheduledFor).getTime() / 60_000) === minute);
  return matches.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0] ?? null;
}

/**
 * Dose slots for one calendar day. `day`'s calendar date is taken as the day in each schedule's own time zone, so a
 * schedule written for Asia/Kolkata shows 08:00 India time whatever zone this browser is in, and daylight-saving
 * changes move the instant, not the wall-clock time.
 */
function slotsOnScheduleDay(schedule: MedicationSchedule, ymd: string): DoseSlot[] {
  if (!schedule.active || !dayInRange(schedule, ymd)) return [];
  const zone = scheduleZone(schedule);
  const out: DoseSlot[] = [];
  for (const time of schedule.times) {
    const at = zonedInstant(ymd, time, zone);
    if (at) out.push({ schedule, at, event: eventForSlot(schedule, at) });
  }
  return out;
}

export function slotsForDay(schedules: MedicationSchedule[], day: Date): DoseSlot[] {
  const ymd = toIsoDate(day);
  return schedules.flatMap((schedule) => slotsOnScheduleDay(schedule, ymd)).sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The next dose still to take. Skips schedules whose reminders are off, finished, paused, or out of date with the prescription. */
export function nextReminder(schedules: MedicationSchedule[], now: Date = new Date()): UpcomingReminder | null {
  let best: UpcomingReminder | null = null;
  for (const schedule of schedules) {
    if (!schedule.active || schedule.remindersEnabled === false || schedule.remindersActive === false) continue;
    const zone = scheduleZone(schedule);
    const today = dateInZone(now, zone);
    for (let offset = 0; offset < 14; offset++) {
      const ymd = addDays(today, offset);
      if (!dayInRange(schedule, ymd)) continue;
      const slot = schedule.times
        .map((time) => zonedInstant(ymd, time, zone))
        .filter((at): at is Date => at !== null && at >= now && !eventForSlot(schedule, at))
        .sort((a, b) => a.getTime() - b.getTime())[0];
      if (slot) {
        if (!best || slot < best.at) best = { schedule, at: slot };
        break;
      }
    }
  }
  return best;
}

/**
 * Slots that have just come due and are still unrecorded: due within the last `windowMs`, for schedules whose
 * reminders are on and current. Used to fire an alert once per dose while the page is open.
 */
export function dueSlots(schedules: MedicationSchedule[], now: Date, windowMs = 5 * 60_000): DoseSlot[] {
  const due: DoseSlot[] = [];
  for (const schedule of schedules) {
    if (schedule.remindersEnabled === false || schedule.remindersActive === false) continue;
    // "Today" is decided in the schedule's own zone, not this browser's.
    const today = dateInZone(now, scheduleZone(schedule));
    for (const ymd of [addDays(today, -1), today]) {
      for (const slot of slotsOnScheduleDay(schedule, ymd)) {
        if (slot.at.getTime() <= now.getTime() && now.getTime() - slot.at.getTime() < windowMs && !slot.event) due.push(slot);
      }
    }
  }
  return due;
}

export type ScheduleConcern = "prescription_missing" | "medicine_changed" | "needs_review";

export const CONCERN_TEXT: Record<ScheduleConcern, string> = {
  prescription_missing: "The prescription this reminder came from can’t be found.",
  medicine_changed: "The prescription was updated after you set this up.",
  needs_review: "This medicine now needs review.",
};

export function scheduleConcern(schedule: MedicationSchedule, prescriptions: Prescription[]): ScheduleConcern | null {
  const rx = prescriptions.find((p) => p.id === schedule.prescriptionId);
  if (!rx) return "prescription_missing";
  const med = rx.medications.find((m) => (m.name ?? "").toLowerCase() === schedule.medicationName.toLowerCase());
  if (!med) return "medicine_changed";
  if ((med.strength ?? null) !== (schedule.strength ?? null) || (med.dose ?? null) !== schedule.dose) return "medicine_changed";
  if (!isInstructionSafe(med)) return "needs_review";
  return null;
}
