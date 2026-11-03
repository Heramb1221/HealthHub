/**
 * Accepts a post-sign-in destination only if it is a path on this site. Anything that could leave the
 * site (absolute URLs, protocol-relative `//host`, backslash tricks, control characters) is dropped.
 */
export function safeNextPath(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return undefined;
  if (/[\u0000-\u001f\u007f]/.test(value)) return undefined;
  return value;
}
