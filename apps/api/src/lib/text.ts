/** True when the string has no control characters (newlines, tabs, NUL, DEL). */
export const hasNoControlChars = (value: string): boolean =>
  [...value].every((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code >= 32 && code !== 127;
  });

/** Parses YYYY-MM-DD as a UTC date. Returns null instead of throwing for anything that is not a real date. */
export const parseDateOnly = (value: string): Date | null => {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === value ? date : null;
};
