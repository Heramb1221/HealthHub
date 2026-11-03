import { addDays, dateInZone, isValidTimeZone, zonedInstant } from "@/lib/zoned-time";

export interface MedicationCalendarItem {
  medicationName: string;
  strength?: string | null;
  dose?: string | null;
  frequency?: string | null;
  instructions?: string | null;
  time: string;
  startDate: string;
  endDate?: string | null;
  timezone?: string;
  /** The schedule id, so the same reminder always gets the same calendar UID. */
  id?: string;
}

function pad(num: number): string {
  return String(num).padStart(2, "0");
}

function zoneOf(item: MedicationCalendarItem): string {
  return item.timezone && isValidTimeZone(item.timezone) ? item.timezone : "Asia/Kolkata";
}

/** First day to put on the calendar: never a day in the past (that would import old, already-gone instances). */
function firstDayOf(item: MedicationCalendarItem, now: Date = new Date()): string {
  const today = dateInZone(now, zoneOf(item));
  return item.startDate > today ? item.startDate : today;
}

/** Local date-time as `YYYYMMDDTHHMMSS`. */
function localStamp(ymd: string, hhmm: string): string {
  return `${ymd.replace(/-/g, "")}T${hhmm.replace(":", "")}00`;
}

/** Start and end stamps for a 15-minute event; a late dose ends on the NEXT day instead of before it starts. */
function startEnd(item: MedicationCalendarItem, now?: Date): { start: string; end: string } {
  const day = firstDayOf(item, now);
  const [h, m] = item.time.split(":").map((v) => parseInt(v, 10) || 0) as [number, number];
  const total = h * 60 + m + 15;
  const endDay = addDays(day, Math.floor(total / 1440));
  const inDay = total % 1440;
  return { start: localStamp(day, `${pad(h)}:${pad(m)}`), end: localStamp(endDay, `${pad(Math.floor(inDay / 60))}:${pad(inDay % 60)}`) };
}

/** The series ends at the end of the last day in the medicine's OWN zone, written as the UTC instant RFC 5545 requires. */
function recurrenceRule(item: MedicationCalendarItem): string {
  if (!item.endDate) return "RRULE:FREQ=DAILY";
  const last = zonedInstant(item.endDate, "23:59", zoneOf(item));
  if (!last) return "RRULE:FREQ=DAILY";
  return `RRULE:FREQ=DAILY;UNTIL=${last.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`;
}

/** Escape text values as RFC 5545 requires (backslash, semicolon, comma, newline). */
export function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets, as RFC 5545 requires, without splitting a multi-byte character. */
export function icsFold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** Stable per reminder, so importing the file again updates the same events instead of adding copies. */
function eventUid(item: MedicationCalendarItem): string {
  const seed = `${item.id ?? item.medicationName}|${item.time}|${item.startDate}`;
  let hash = 5381;
  for (const ch of seed) hash = ((hash * 33) ^ ch.codePointAt(0)!) >>> 0;
  return `sehat-${(item.id ?? "med").replace(/[^A-Za-z0-9-]/g, "")}-${item.time.replace(":", "")}-${hash.toString(16)}@sehatmeds`;
}

export function createGoogleCalendarWebUrl(item: MedicationCalendarItem): string {
  const title = `💊 Take ${item.medicationName}${item.strength ? ` ${item.strength}` : ""}`;
  const details = [
    `Sehat Meds Medication Reminder`,
    `Medicine: ${item.medicationName}`,
    item.dose ? `Dose: ${item.dose}` : null,
    item.frequency ? `Frequency: ${item.frequency}` : null,
    item.instructions ? `Instructions: ${item.instructions}` : null,
    `Follow your doctor's advice and the details you reviewed in Sehat Meds.`,
  ]
    .filter(Boolean)
    .join("\n");

  const { start, end } = startEnd(item);
  const params = new URLSearchParams({ action: "TEMPLATE", text: title, details, dates: `${start}/${end}`, ctz: zoneOf(item) });
  params.set("recur", recurrenceRule(item));
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function generateMedicationIcs(items: MedicationCalendarItem[], now: Date = new Date()): string {
  const nowStamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const events = items.map((item) => {
    const { start, end } = startEnd(item, now);
    const zone = zoneOf(item);
    const title = `💊 Take ${item.medicationName}${item.strength ? ` ${item.strength}` : ""}`;
    const desc = [`Dose: ${item.dose || "as prescribed"}`, `Frequency: ${item.frequency || "as prescribed"}`, item.instructions || ""].filter(Boolean).join(". ");

    return [
      "BEGIN:VEVENT",
      `UID:${eventUid(item)}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;TZID=${zone}:${start}`,
      `DTEND;TZID=${zone}:${end}`,
      recurrenceRule(item),
      `SUMMARY:${icsEscape(title)}`,
      `DESCRIPTION:${icsEscape(desc)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Medication reminder",
      "TRIGGER:-PT5M",
      "END:VALARM",
      "END:VEVENT",
    ]
      .map(icsFold)
      .join("\r\n");
  });

  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Sehat Meds//Medication Schedules//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...events, "END:VCALENDAR"].join("\r\n");
}

export function downloadMedicationIcsFile(items: MedicationCalendarItem[], filename = "sehatmeds-medications.ics") {
  const icsContent = generateMedicationIcs(items);
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
