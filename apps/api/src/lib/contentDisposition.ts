/**
 * Build a safe Content-Disposition header value.
 *
 * Node rejects header values containing characters above U+00FF (ERR_INVALID_CHAR), and the upload
 * sanitiser deliberately keeps any Unicode letters, so a file called "पर्चा.jpg" used to crash the
 * route that serves it back. We send an ASCII fallback plus an RFC 6266/5987 `filename*` parameter.
 */
export function contentDisposition(type: "inline" | "attachment", filename: string): string {
  const clean = filename.replace(/[\r\n]/g, " ").trim() || "download";
  // Plain, header-safe ASCII names need no extended parameter.
  if (/^[A-Za-z0-9._ -]+$/.test(clean)) return `${type}; filename="${clean}"`;
  const ascii =
    clean
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_")
      .trim() || "download";
  const extension = /\.[A-Za-z0-9]{1,8}$/.exec(clean)?.[0] ?? "";
  const fallback = /[A-Za-z0-9]/.test(ascii.replace(extension, "")) ? ascii : `download${extension}`;
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
