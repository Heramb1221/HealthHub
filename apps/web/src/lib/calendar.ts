/**
 * Helpers for exporting medication reminders to Google Calendar web URL and .ics format.
 */

export interface MedicationCalendarItem {
  medicationName: string;
  strength?: string | null;
  dose?: string | null;
  frequency?: string | null;
  instructions?: string | null;
  time: string; // HH:MM
  startDate: string; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD
  timezone?: string;
}

function pad(num: number): string {
  return String(num).padStart(2, "0");
}

function formatGoogleDate(dateStr: string, timeStr: string): string {
  const cleanDate = dateStr.replace(/-/g, "");
  const [h, m] = timeStr.split(":").map((v) => parseInt(v, 10) || 0);
  const timeFormatted = `${pad(h)}${pad(m)}00`;
  return `${cleanDate}T${timeFormatted}`;
}

function addMinutes(dateStr: string, timeStr: string, minutesToAdd: number): string {
  const cleanDate = dateStr.replace(/-/g, "");
  const [h, m] = timeStr.split(":").map((v) => parseInt(v, 10) || 0);
  const totalMin = h * 60 + m + minutesToAdd;
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  return `${cleanDate}T${pad(newH)}${pad(newM)}00`;
}

export function createGoogleCalendarWebUrl(item: MedicationCalendarItem): string {
  const title = `💊 Take ${item.medicationName}${item.strength ? ` ${item.strength}` : ""}`;
  const details = [
    `HealthHub Medication Reminder`,
    `Medicine: ${item.medicationName}`,
    item.dose ? `Dose: ${item.dose}` : null,
    item.frequency ? `Frequency: ${item.frequency}` : null,
    item.instructions ? `Instructions: ${item.instructions}` : null,
    `Prescribed medication schedule. Please take on time as instructed.`,
  ]
    .filter(Boolean)
    .join("\n");

  const startFormatted = formatGoogleDate(item.startDate, item.time);
  const endFormatted = addMinutes(item.startDate, item.time, 15);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    details,
    dates: `${startFormatted}/${endFormatted}`,
    ctz: item.timezone || "Asia/Kolkata",
  });

  if (item.endDate) {
    const untilClean = item.endDate.replace(/-/g, "");
    params.set("recur", `RRULE:FREQ=DAILY;UNTIL=${untilClean}T235959Z`);
  } else {
    params.set("recur", "RRULE:FREQ=DAILY");
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function generateMedicationIcs(items: MedicationCalendarItem[]): string {
  const tz = items[0]?.timezone || "Asia/Kolkata";
  const nowStamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

  const events = items.map((item, index) => {
    const cleanStart = formatGoogleDate(item.startDate, item.time);
    const cleanEnd = addMinutes(item.startDate, item.time, 15);
    const title = `💊 Take ${item.medicationName}${item.strength ? ` ${item.strength}` : ""}`;
    const desc = `Dose: ${item.dose || "1 dose"}. Frequency: ${item.frequency || "As prescribed"}. ${item.instructions || ""}`;
    const until = item.endDate ? `RRULE:FREQ=DAILY;UNTIL=${item.endDate.replace(/-/g, "")}T235959Z` : "RRULE:FREQ=DAILY";

    return [
      "BEGIN:VEVENT",
      `UID:med-${Date.now()}-${index}@healthhub`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;TZID=${tz}:${cleanStart}`,
      `DTEND;TZID=${tz}:${cleanEnd}`,
      until,
      `SUMMARY:${title}`,
      `DESCRIPTION:${desc}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Medication Reminder",
      "TRIGGER:-PT5M",
      "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HealthHub//Medication Schedules//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadMedicationIcsFile(items: MedicationCalendarItem[], filename = "healthhub-medications.ics") {
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
