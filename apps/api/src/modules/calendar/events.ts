import { createHash } from "node:crypto";
import { addDays, dateInZone, zonedInstant } from "../../lib/zonedTime.js";
import type { ScheduleDto } from "../schedules/service.js";

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/**
 * Google accepts a caller-chosen event id of lowercase a-v and 0-9. Deriving it from the schedule and the clock time
 * means syncing the same reminder twice addresses the SAME event (update, not duplicate) and lets us find and remove
 * it later.
 */
export function calendarEventId(scheduleId: string, time: string): string {
  return `sehat${createHash("sha256").update(`${scheduleId}|${time}`).digest("hex").slice(0, 32)}`;
}

function addMinutes(time: string, minutes: number): { time: string; dayOffset: number } {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const total = h * 60 + m + minutes;
  const dayOffset = Math.floor(total / 1440);
  const inDay = ((total % 1440) + 1440) % 1440;
  return { time: `${String(Math.floor(inDay / 60)).padStart(2, "0")}:${String(inDay % 60).padStart(2, "0")}`, dayOffset };
}

/** RFC 5545 UTC timestamp, e.g. 20261031T182959Z. */
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export interface BuiltEvent {
  id: string;
  payload: Record<string, unknown>;
}

/**
 * One recurring daily event for one reminder time. Times are written in the schedule's own zone (so Google handles
 * daylight saving), the end is computed by clock arithmetic (a 23:55 dose ends 00:10 the next day, not before it starts),
 * and the series stops at the end of the schedule's last day in that zone. Text names no medicine unless asked to,
 * because calendar pop-ups appear on lock screens.
 */
export function buildEvent(schedule: ScheduleDto, time: string, options: { showMedicineNames: boolean; now?: Date }): BuiltEvent {
  const now = options.now ?? new Date();
  const zone = schedule.timezone;
  // Never create past instances: start from the later of the schedule's first day and today.
  const today = dateInZone(now, zone);
  const firstDay = schedule.startDate > today ? schedule.startDate : today;
  const end = addMinutes(time, 15);
  const med = schedule.medication;

  const recurrence = ["RRULE:FREQ=DAILY"];
  if (schedule.endDate) {
    const lastMoment = zonedInstant(schedule.endDate, "23:59", zone);
    if (lastMoment) recurrence[0] = `RRULE:FREQ=DAILY;UNTIL=${utcStamp(lastMoment)}`;
  }

  const summary = options.showMedicineNames ? `💊 Take ${med.name ?? "your medicine"}${med.strength ? ` ${med.strength}` : ""}` : "💊 Sehat Meds: a dose is due";
  const description = options.showMedicineNames
    ? [
        "Sehat Meds medication reminder",
        `Medicine: ${med.name ?? ""}`,
        med.dose ? `Dose: ${med.dose}` : null,
        med.frequency ? `Prescribed frequency: ${med.frequency}` : null,
        med.instructions ? `Instructions: ${med.instructions}` : null,
        "Follow your doctor's advice. This reminder was made from details you reviewed in Sehat Meds.",
      ]
        .filter(Boolean)
        .join("\n")
    : "Open Sehat Meds to see which dose is due and to record it. Medicine names are left out of this event on purpose.";

  const id = calendarEventId(schedule.id, time);
  return {
    id,
    payload: {
      id,
      summary,
      description,
      start: { dateTime: `${firstDay}T${time}:00`, timeZone: zone },
      end: { dateTime: `${addDays(firstDay, end.dayOffset)}T${end.time}:00`, timeZone: zone },
      recurrence,
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 5 }, { method: "popup", minutes: 0 }] },
      extendedProperties: { private: { sehatScheduleId: schedule.id, sehatTime: time } },
      status: "confirmed",
    },
  };
}

/** Reminders belong on the calendar only while they are on, current and have at least one time. */
export function wantedTimes(schedule: ScheduleDto): string[] {
  return schedule.remindersActive && schedule.isActive ? [...new Set(schedule.reminderTimes)] : [];
}

export interface ReconcileResult {
  created: number;
  updated: number;
  removed: number;
  failed: number;
  links: Array<{ time: string; link?: string }>;
}

type Fetch = typeof fetch;

/**
 * Make Google Calendar hold exactly the events this schedule should have: create the missing ones, update the existing
 * ones in place, delete any of ours that are no longer wanted (a time was edited out, the schedule was paused, finished or
 * went out of date). Running it again changes nothing, so repeated syncs never duplicate.
 */
export async function reconcileScheduleEvents(
  fetchImpl: Fetch,
  accessToken: string,
  schedule: ScheduleDto,
  options: { showMedicineNames: boolean; now?: Date },
): Promise<ReconcileResult> {
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const result: ReconcileResult = { created: 0, updated: 0, removed: 0, failed: 0, links: [] };
  const desired = new Map(wantedTimes(schedule).map((time) => [time, buildEvent(schedule, time, options)]));

  // Find the events we made for this schedule (any time), so obsolete ones can be removed.
  const existingIds = new Set<string>();
  try {
    const url = `${EVENTS_URL}?privateExtendedProperty=${encodeURIComponent(`sehatScheduleId=${schedule.id}`)}&maxResults=250&showDeleted=false`;
    const res = await fetchImpl(url, { headers });
    if (res.ok) for (const item of ((await res.json()) as { items?: Array<{ id: string }> }).items ?? []) existingIds.add(item.id);
    else result.failed += 1;
  } catch {
    result.failed += 1;
  }

  const wantedIds = new Set([...desired.values()].map((e) => e.id));
  for (const id of existingIds) {
    if (wantedIds.has(id)) continue;
    try {
      const res = await fetchImpl(`${EVENTS_URL}/${id}`, { method: "DELETE", headers });
      if (res.ok || res.status === 404 || res.status === 410) result.removed += 1;
      else result.failed += 1;
    } catch {
      result.failed += 1;
    }
  }

  for (const [time, event] of desired) {
    try {
      let res = await fetchImpl(EVENTS_URL, { method: "POST", headers, body: JSON.stringify(event.payload) });
      let outcome: "created" | "updated" = "created";
      if (res.status === 409) {
        res = await fetchImpl(`${EVENTS_URL}/${event.id}`, { method: "PUT", headers, body: JSON.stringify(event.payload) });
        outcome = "updated";
      }
      if (res.ok) {
        result[outcome] += 1;
        const body = (await res.json().catch(() => ({}))) as { htmlLink?: string };
        result.links.push({ time, ...(body.htmlLink ? { link: body.htmlLink } : {}) });
      } else {
        result.failed += 1;
      }
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
