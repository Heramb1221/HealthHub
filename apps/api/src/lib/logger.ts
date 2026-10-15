/**
 * Minimal structured logger. Callers must only pass operational metadata
 * (method, route pattern, status, requestId). Never pass request bodies,
 * tokens, passwords, uploaded content, medical data, or ids taken from URLs.
 */
type Level = "info" | "warn" | "error";

let sink: ((line: string) => void) | null = null;

/** Test hook: capture log lines instead of writing them. Pass null to restore normal behaviour. */
export function setLogSink(next: ((line: string) => void) | null): void {
  sink = next;
}

export function log(level: Level, message: string, fields: Record<string, string | number> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  if (sink) {
    sink(line);
    return;
  }
  if (process.env.NODE_ENV === "test") return;
  (level === "error" ? process.stderr : process.stdout).write(`${line}\n`);
}
