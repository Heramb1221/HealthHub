export type AllowedMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

const startsWith = (buffer: Buffer, bytes: number[], offset = 0): boolean =>
  buffer.length >= offset + bytes.length && bytes.every((byte, i) => buffer[offset + i] === byte);

/**
 * Identifies the file type from its leading bytes. The client's declared
 * content type is never trusted on its own. Returns null for anything that is
 * not a JPEG, PNG, WebP, or PDF.
 */
export function sniffMime(buffer: Buffer): AllowedMime | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // WebP: "RIFF" <4 size bytes> "WEBP"
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // "%PDF-"
  return null;
}

/** Normalises the declared type for comparison. `image/jpg` is a common non-standard spelling of JPEG. */
export function normalizeDeclaredMime(declared: string): string {
  const base = declared.split(";")[0]?.trim().toLowerCase() ?? "";
  return base === "image/jpg" ? "image/jpeg" : base;
}

/**
 * Makes a client-supplied file name safe to store and display: base name only,
 * no path separators or control characters, limited alphabet and length.
 * The result is for display only; it is never used to build a storage path.
 */
export function sanitizeFileName(raw: string | undefined): string {
  const FALLBACK = "upload";
  if (!raw) return FALLBACK;
  const base = raw.normalize("NFC").split(/[\\/]/).pop() ?? "";
  const cleaned = [...base]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code < 32 || code === 127) return "";
      return /[\p{L}\p{M}\p{N} ._-]/u.test(char) ? char : "_";
    })
    .join("")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 100)
    .trim();
  return cleaned.length > 0 ? cleaned : FALLBACK;
}
