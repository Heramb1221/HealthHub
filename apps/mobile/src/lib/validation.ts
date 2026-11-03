
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 254;
}

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 256;
export const FULL_NAME_MAX = 120;

/**
 * Password rules apply to account creation only. Sign-in never validates length
 * or content on the client, and passwords are never trimmed or rewritten:
 * leading, trailing and inner spaces are significant characters.
 */
export function passwordProblem(value: string): string | null {
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (value.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return null;
}

/** Full names may contain spaces, apostrophes, hyphens, dots and any Unicode letters. */
export function fullNameProblem(value: string): string | null {
  const v = value.trim().replace(/\s+/g, " ");
  if (v.length < 2) return "Enter your full name.";
  if (v.length > FULL_NAME_MAX) return `Use ${FULL_NAME_MAX} characters or fewer.`;
  if (/[\u0000-\u001f\u007f]/.test(v)) return "Remove special control characters from your name.";
  return null;
}

/**
 * Split a full name into Clerk's first/last name fields without losing words.
 * "Mary Anne van der Berg" -> first "Mary", last "Anne van der Berg".
 */
export function splitFullName(value: string): { firstName: string; lastName?: string } {
  const v = value.trim().replace(/\s+/g, " ");
  const i = v.indexOf(" ");
  if (i === -1) return { firstName: v };
  return { firstName: v.slice(0, i), lastName: v.slice(i + 1) };
}

export type LoginIdentifier = { kind: "email"; value: string } | { kind: "phone"; value: string };

/**
 * Normalise a typed phone number to E.164, which is what Clerk expects.
 * - "+<country><number>" is kept as the user entered it (digits only after "+").
 * - A bare 10-digit number starting 6-9 (optionally with a leading 0 or 91) is treated as an
 *   Indian mobile number and prefixed with +91. Anything else needs an explicit country code.
 */
export function normalizePhoneE164(input: string): string | null {
  const raw = input.trim();
  if (!raw || /[^0-9+\s()\-.]/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 && digits[0] !== "0" ? `+${digits}` : null;
  }
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

/** Decide whether the sign-in identifier is an email or a phone number. */
export function parseLoginIdentifier(input: string): LoginIdentifier | null {
  const v = input.trim();
  if (!v) return null;
  if (v.includes("@")) return isValidEmail(v) ? { kind: "email", value: v } : null;
  const phone = normalizePhoneE164(v);
  return phone ? { kind: "phone", value: phone } : null;
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

/**
 * Validate an optional whole-number text field against an inclusive range.
 * Blank is allowed (the value is simply omitted). Returns an error message or null.
 */
export function integerRangeProblem(value: string, label: string, min: number, max: number): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (!/^\d+$/.test(v)) return `${label} must be a whole number.`;
  const n = Number(v);
  if (n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  return null;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const UPLOAD_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]);

/** Mirror of the API's upload rules (type and size), so people learn about a problem before waiting on an upload. */
export function uploadProblem(file: { mimeType?: string | null; size?: number | null }): string | null {
  const mime = (file.mimeType ?? "").toLowerCase().split(";")[0]?.trim() ?? "";
  if (mime === "image/heic" || mime === "image/heif") {
    return "This photo is in HEIC format, which can't be read yet. Take the photo again in the app, or choose “Most compatible” in your camera settings.";
  }
  if (!UPLOAD_MIME.has(mime)) return "Choose a JPG, PNG or WebP photo, or a PDF.";
  if (typeof file.size === "number" && file.size > MAX_UPLOAD_BYTES) {
    return `This file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Choose one under ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`;
  }
  if (typeof file.size === "number" && file.size === 0) return "This file is empty. Choose another.";
  return null;
}
