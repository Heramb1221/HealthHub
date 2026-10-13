import type { z } from "zod";

export type FieldErrors = Record<string, string>;

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

/** Validate raw form values against a zod schema. Returns the first message per field. */
export function validate<S extends z.ZodType>(schema: S, values: unknown): ValidationResult<z.infer<S>> {
  const parsed = schema.safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

export function formValues(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** Only allow same-site relative paths as post-sign-in destinations (blocks open redirects). */
export function safeNextPath(next: string | undefined | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next;
}

/**
 * Like `validate`, but keys errors by the full dotted path (e.g. "medications.0.name") so array rows can show
 * their own messages. Used by forms with repeatable rows.
 */
export function validateByPath<S extends z.ZodType>(schema: S, values: unknown): ValidationResult<z.infer<S>> {
  const parsed = schema.safeParse(values);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/** The error for a field or, for a list field, the first error on any of its rows (e.g. "times" or "times.0"). */
/**
 * After a failed validation, move keyboard focus to the first field marked aria-invalid.
 * Runs after the next paint so the error state has rendered.
 */
export function focusFirstInvalid(root: HTMLElement | null | undefined): void {
  requestAnimationFrame(() => root?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}

export function errorFor(errors: FieldErrors, field: string): string | undefined {
  if (errors[field]) return errors[field];
  const row = Object.keys(errors).find((k) => k.startsWith(`${field}.`));
  return row ? errors[row] : undefined;
}
