/**
 * Minimal structured logger. Callers must only pass operational metadata
 * (method, path, status, requestId). Never pass request bodies, tokens,
 * passwords, uploaded content, or medical data.
 */
type Level = "info" | "warn" | "error";

export function log(level: Level, message: string, fields: Record<string, string | number> = {}): void {
  if (process.env.NODE_ENV === "test") return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  (level === "error" ? process.stderr : process.stdout).write(`${line}\n`);
}
