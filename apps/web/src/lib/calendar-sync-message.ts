import type { CalendarSyncResult } from "@/lib/api/types";

export interface SyncMessage {
  tone: "success" | "warning" | "error" | "info";
  title: string;
  description?: string;
}

/**
 * Plain-language outcome of a calendar sync. It never claims success the server did not report: failures and removals
 * are said out loud, and "nothing to add" is not dressed up as a sync.
 */
export function describeCalendarSync(res: CalendarSyncResult): SyncMessage {
  const synced = res.syncedCount;
  const removed = res.removedCount ?? 0;
  const failed = res.failedCount ?? 0;
  const skipped = res.skippedCount ?? 0;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  if (failed > 0 && synced === 0 && removed === 0) {
    return { tone: "error", title: "Google Calendar sync failed", description: "Nothing was changed on your calendar. Check your connection and try again." };
  }
  if (failed > 0) {
    return {
      tone: "warning",
      title: `Google Calendar is only partly up to date`,
      description: `${plural(synced, "reminder")} updated${removed ? `, ${plural(removed, "old event")} removed` : ""}, but ${plural(failed, "step")} failed. Run the sync again.`,
    };
  }
  if (synced === 0 && removed === 0) {
    return {
      tone: "info",
      title: "Nothing to put on your calendar",
      description: skipped > 0 ? "Reminders are off, paused, finished or out of date with the prescription for these medicines." : "Add reminder times to a medicine first.",
    };
  }
  return {
    tone: "success",
    title: `Google Calendar is up to date: ${plural(synced, "reminder")}`,
    description: removed ? `${plural(removed, "old event")} removed because the reminder was paused, finished or changed.` : "Running this again won't create duplicates.",
  };
}
