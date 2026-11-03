/**
 * Wall-clock time in a named time zone <-> real instants, without a date library.
 * Reminders are stored as local "HH:MM" plus an IANA zone, so every consumer must turn
 * "08:00 in Asia/Kolkata on 2026-03-08" into the same instant. A copy of this file lives in the web and
 * mobile apps (apps/web/src/lib/zoned-time.ts, apps/mobile/src/lib/zonedTime.ts); keep them identical.
 *
 * Daylight-saving rules:
 *  - a time that does not exist (spring forward, e.g. 02:30 when clocks jump 02:00 -> 03:00) moves forward to the
 *    first valid moment, so the reminder still happens that day;
 *  - a time that happens twice (fall back) uses the FIRST occurrence, so a dose is never reminded late.
 */

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Offset of `timeZone` from UTC at `instantMs`, in milliseconds (positive east of UTC). */
export function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = formatter(timeZone).formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return wall - Math.floor(instantMs / 1000) * 1000;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The instant at which the wall clock in `timeZone` reads `hhmm` on calendar day `ymd`. Null for malformed input. */
export function zonedInstant(ymd: string, hhmm: string, timeZone: string): Date | null {
  const d = YMD.exec(ymd);
  const t = HHMM.exec(hhmm);
  if (!d || !t || !isValidTimeZone(timeZone)) return null;
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  if (new Date(wall).toISOString().slice(0, 10) !== ymd) return null; // e.g. 2026-02-30

  const before = zoneOffsetMs(wall - DAY_MS, timeZone);
  const after = zoneOffsetMs(wall + DAY_MS, timeZone);
  const candidates = [...new Set([wall - before, wall - after])];
  const valid = candidates.filter((c) => c + zoneOffsetMs(c, timeZone) === wall);
  if (valid.length > 0) return new Date(Math.min(...valid)); // overlap: first occurrence
  return new Date(wall - before); // gap: the first valid moment after the missing hour
}

/** Calendar day (YYYY-MM-DD) that `instant` falls on in `timeZone`. */
export function dateInZone(instant: Date, timeZone: string): string {
  const p = formatter(timeZone).formatToParts(instant);
  const get = (type: string) => p.find((x) => x.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Wall-clock "HH:MM" that `instant` shows in `timeZone`. */
export function timeInZone(instant: Date, timeZone: string): string {
  const p = formatter(timeZone).formatToParts(instant);
  const get = (type: string) => p.find((x) => x.type === type)?.value ?? "00";
  return `${String(Number(get("hour")) % 24).padStart(2, "0")}:${get("minute")}`;
}

/** `ymd` shifted by whole calendar days (not 24-hour blocks, so it is DST-safe). */
export function addDays(ymd: string, days: number): string {
  const d = YMD.exec(ymd);
  if (!d) return ymd;
  return new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]) + days)).toISOString().slice(0, 10);
}
