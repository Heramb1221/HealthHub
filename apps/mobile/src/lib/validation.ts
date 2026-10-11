/**
 * Client-side validation is for fast, friendly feedback only. The server validates every request
 * and its decision is final (AGENTS.md: validate untrusted input at API boundaries).
 */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 254;
}

/** Backend note B1 (proposed): length 10 to 128. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export function passwordProblem(value: string): string | null {
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (value.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return null;
}

/** "YYYY-MM-DD" that is a real calendar date. */
export function isValidDateOnly(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isFutureDateOnly(value: string, now: Date = new Date()): boolean {
  if (!isValidDateOnly(value)) return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return value > today;
}

export function isValidTimeOfDay(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Comma/newline separated text to a trimmed, de-duplicated list. */
export function parseList(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[,\n]/)) {
    const trimmed = part.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

export function listToText(list: string[] | undefined): string {
  return (list ?? []).join(", ");
}

/** Empty or whitespace text to null (for nullable API fields). */
export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
