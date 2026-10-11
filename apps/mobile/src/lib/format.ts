const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Format a calendar date (date of birth, prescription date, start date) without timezone shifting.
 * Accepts "YYYY-MM-DD" or an ISO date-time whose date part is the calendar date.
 */
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "Not provided";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return "Not provided";
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return "Not provided";
  return `${Number(match[3])} ${month} ${match[1]}`;
}

/** Date part of a stored date for editing fields: "YYYY-MM-DD" or "". */
export function toDateInput(value: string | null | undefined): string {
  const match = value ? /^(\d{4}-\d{2}-\d{2})/.exec(value) : null;
  return match?.[1] ?? "";
}

/** Format an instant in the device's local time zone, e.g. "12 Oct 2026, 4:30 pm". */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Not provided";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Not provided";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${formatClock(d)}`;
}

export function formatTimeOnly(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : formatClock(d);
}

export function formatClock(d: Date): string {
  const h = d.getHours();
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(d.getMinutes())} ${suffix}`;
}

/** Local calendar day key "YYYY-MM-DD" for grouping slots. */
export function localDayKey(value: string): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDayHeading(dayKey: string): string {
  return formatDateOnly(dayKey);
}

/** "HH:mm" on the given local day, as an ISO instant (used to build a dose-event `scheduledFor`). */
export function localTimeToIso(hhmm: string, day: Date = new Date()): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!match) return null;
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(match[1]), Number(match[2]), 0, 0);
  return d.toISOString();
}

export function minutesUntil(iso: string, now: Date = new Date()): number {
  return Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
}

/** Plain countdown such as "9 min" or "1 h 5 min". Returns "Expired" when past. */
export function formatCountdown(iso: string, now: Date = new Date()): string {
  const mins = minutesUntil(iso, now);
  if (mins <= 0) return "Expired";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

/** Display text for a blank/absent value. Never invents a value. */
export function orDash(value: string | null | undefined): string {
  return value && value.trim() ? value : "Not provided";
}
