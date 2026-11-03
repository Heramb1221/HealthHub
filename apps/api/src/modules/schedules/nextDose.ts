import { addDays, dateInZone, timeInZone, zonedInstant } from "../../lib/zonedTime.js";
import type { ScheduleDto } from "./service.js";

export interface NextDose {
  scheduleId: string;
  at: Date;
  /** Wall-clock time in the schedule's own zone, as written on the schedule. */
  time: string;
}

/**
 * The soonest upcoming dose across schedules, in each schedule's own zone (daylight-saving aware). Only schedules
 * whose reminders are on and current count; nothing is invented when there are none.
 */
export function nextDose(schedules: ScheduleDto[], now: Date = new Date(), horizonDays = 14): NextDose | null {
  let best: NextDose | null = null;
  for (const schedule of schedules) {
    if (!schedule.remindersActive) continue;
    const today = dateInZone(now, schedule.timezone);
    for (let offset = 0; offset <= horizonDays; offset += 1) {
      const ymd = addDays(today, offset);
      if (ymd < schedule.startDate || (schedule.endDate && ymd > schedule.endDate)) continue;
      const at = schedule.reminderTimes
        .map((time) => zonedInstant(ymd, time, schedule.timezone))
        .filter((d): d is Date => d !== null && d.getTime() > now.getTime())
        .sort((a, b) => a.getTime() - b.getTime())[0];
      if (at) {
        if (!best || at < best.at) best = { scheduleId: schedule.id, at, time: timeInZone(at, schedule.timezone) };
        break;
      }
    }
  }
  return best;
}
