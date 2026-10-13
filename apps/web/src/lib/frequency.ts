/**
 * Suggestions for reminder times and an end date, read from the prescription's own text.
 *
 * These only PRE-FILL the form. The patient sees the prescription's wording next to the times and
 * confirms or changes them. Anything the parser doesn't clearly recognise returns null, so nothing is guessed:
 * "every 8 hours", "once a week", "as needed", "at bedtime" all return null.
 */
export function suggestTimes(frequency: string | null | undefined): string[] | null {
  if (!frequency) return null;
  const f = frequency.toLowerCase();
  if (/week|month|alternate|other day|hour|as needed|prn|sos|bedtime|night|morning|evening/.test(f)) return null;
  if (/four times|4\s*(x|times)|\bqid\b|\bqds\b/.test(f)) return ["07:00", "12:00", "17:00", "22:00"];
  if (/thrice|three times|3\s*(x|times)|\btds\b|\btid\b/.test(f)) return ["08:00", "14:00", "21:00"];
  if (/twice|two times|2\s*(x|times)|\bbd\b|\bbid\b/.test(f)) return ["08:00", "20:00"];
  if (/once|one time|1\s*(x|time)|\bod\b|daily|every day/.test(f)) return ["09:00"];
  return null;
}

/** "5 days" or "2 weeks" give a length in days. Anything else gives null. */
export function durationDays(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const match = /^\s*(\d{1,3})\s*(day|days|week|weeks)\s*$/i.exec(duration);
  if (!match) return null;
  const n = Number(match[1]);
  return match[2].toLowerCase().startsWith("week") ? n * 7 : n;
}

/** Inclusive: starting on `startIso` for N days ends on day N. */
export function suggestEndDate(startIso: string, duration: string | null | undefined): string | null {
  const days = durationDays(duration);
  if (!days || days < 1) return null;
  const d = new Date(`${startIso}T00:00:00`);
  d.setDate(d.getDate() + days - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
