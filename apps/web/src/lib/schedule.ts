import type { DoseEvent, MedicationSchedule, Prescription } from "@/lib/api/types";
import { isInstructionSafe } from "@/lib/prescription-safety";

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

function atTime(day: Date, hhmm: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const [h, m] = [Number(match[1]), Number(match[2])];
  if (h > 23 || m > 59) return null;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
}

function parseDay(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function inRange(schedule: MedicationSchedule, at: Date): boolean {
  if (at < parseDay(schedule.startDate)) return false;
  if (schedule.endDate && at > new Date(`${schedule.endDate}T23:59:59`)) return false;
  return true;
}

export function eventForSlot(schedule: MedicationSchedule, at: Date): DoseEvent | null {
  const minute = Math.floor(at.getTime() / 60_000);
  const matches = (schedule.doseEvents ?? []).filter((e) => Math.floor(new Date(e.scheduledFor).getTime() / 60_000) === minute);
  return matches.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0] ?? null;
}

export function slotsForDay(schedules: MedicationSchedule[], day: Date): DoseSlot[] {
  const slots: DoseSlot[] = [];
  for (const schedule of schedules) {
    if (!schedule.active) continue;
    for (const time of schedule.times) {
      const at = atTime(day, time);
      if (!at || !inRange(schedule, at)) continue;
      slots.push({ schedule, at, event: eventForSlot(schedule, at) });
    }
  }
  return slots.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function nextReminder(schedules: MedicationSchedule[], now: Date = new Date()): UpcomingReminder | null {
  for (let offset = 0; offset < 14; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const slot = slotsForDay(schedules, day).find((s) => s.at >= now && !s.event);
    if (slot) return { schedule: slot.schedule, at: slot.at };
  }
  return null;
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
