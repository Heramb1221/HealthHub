import { DEFAULT_LANGUAGE, LOCALE_TAGS, type SupportedLanguage } from "./languages";

/**
 * Locale-aware formatting for UI text.
 *
 * Digits are always Latin (0-9), even for Hindi, Marathi and Bengali. Doses, times and
 * dates in medical records must stay unambiguous, and a numbering-system change is not
 * something a patient should have to read through.
 */

const LATIN_DIGITS = { numberingSystem: "latn" } as const;

export function localeTag(lang: SupportedLanguage): string {
  return LOCALE_TAGS[lang] ?? LOCALE_TAGS[DEFAULT_LANGUAGE];
}

/**
 * Parses a value into a Date. A bare `YYYY-MM-DD` is read as a local calendar date so it
 * does not shift to the previous day in timezones west of UTC.
 */
export function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value: Date | string | number | null | undefined,
  lang: SupportedLanguage,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
  fallback = "",
): string {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(localeTag(lang), { ...LATIN_DIGITS, ...options }).format(date);
}

export function formatDateTime(
  value: Date | string | number | null | undefined,
  lang: SupportedLanguage,
  fallback = "",
): string {
  return formatDate(
    value,
    lang,
    { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" },
    fallback,
  );
}

export function formatTime(value: Date | string | number | null | undefined, lang: SupportedLanguage, fallback = ""): string {
  return formatDate(value, lang, { hour: "numeric", minute: "2-digit" }, fallback);
}

export function formatNumber(value: number, lang: SupportedLanguage, options: Intl.NumberFormatOptions = {}): string {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat(localeTag(lang), { ...LATIN_DIGITS, ...options }).format(value);
}

/** Indian rupee amount, e.g. ₹1,250.00 (grouping follows the locale). */
export function formatRupees(amount: number, lang: SupportedLanguage): string {
  return formatNumber(amount, lang, { style: "currency", currency: "INR" });
}
