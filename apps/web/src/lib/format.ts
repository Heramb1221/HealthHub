const LOCALE = "en-IN";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Not provided";
  // Plain dates (YYYY-MM-DD) are shown as that calendar day, not shifted by timezone.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not provided";
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit" }).format(date);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today, 8:00 pm", "Tomorrow, 10:30 am", or "Mon 12 Oct, 10:30 am". */
export function formatWhen(target: Date, now: Date = new Date()): string {
  const dayDiff = Math.round((startOfDay(target) - startOfDay(now)) / 86_400_000);
  const time = formatTime(target);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  const day = new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short" }).format(target);
  return `${day}, ${time}`;
}

const BLANK = "Not provided";
export function orBlank(value: string | null | undefined): string {
  return value && value.trim() ? value : BLANK;
}

/** "08:00" -> "8:00 am" */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return formatTime(new Date(2000, 0, 1, h, m));
}

/** "Saturday 10 October" */
export function formatDayLong(d: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long" }).format(d);
}
