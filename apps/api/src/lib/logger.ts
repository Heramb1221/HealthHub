
type Level = "info" | "warn" | "error";

let sink: ((line: string) => void) | null = null;

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
