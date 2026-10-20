
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 254;
}

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export function passwordProblem(value: string): string | null {
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (value.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return null;
}

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

export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function phoneProblem(value: string): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (v.length < 7 || v.length > 20 || !/^\+?[0-9\s()-]+$/.test(v)) {
    return "Use 7 to 20 characters: digits, spaces, brackets or hyphens, with an optional leading +.";
  }
  return null;
}

export function dateOfBirthProblem(value: string, now: Date = new Date()): string | null {
  if (value === "") return null;
  if (!isValidDateOnly(value)) return "Use the format YYYY-MM-DD, for example 1998-04-23.";
  if (value < "1900-01-01") return "Date of birth can't be before 1900.";
  if (isFutureDateOnly(value, now)) return "Date of birth can't be in the future.";
  return null;
}

export function listProblem(items: string[]): string | null {
  if (items.length > 30) return "Use at most 30 items.";
  if (items.some((i) => i.length > 100)) return "Keep each item under 100 characters.";
  return null;
}
