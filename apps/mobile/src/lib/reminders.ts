import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { MedicationSchedule } from "../api/types.ts";
import { diffReminders, reminderContent } from "./reminderSync.ts";
import { planReminders, REMINDER_ID_PREFIX } from "./schedule.ts";

const CHANNEL_ID = "medication-reminders";

export type ReminderPermission = "granted" | "denied" | "undetermined" | "unavailable";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function getReminderPermission(): Promise<ReminderPermission> {
  try {
    const res = await Notifications.getPermissionsAsync();
    if (res.granted) return "granted";
    return res.canAskAgain ? "undetermined" : "denied";
  } catch {
    return "unavailable";
  }
}

export async function requestReminderPermission(): Promise<ReminderPermission> {
  try {
    const res = await Notifications.requestPermissionsAsync();
    if (res.granted) return "granted";
    return res.canAskAgain ? "undetermined" : "denied";
  } catch {
    return "unavailable";
  }
}

async function ownScheduledIds(): Promise<string[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.map((n) => n.identifier).filter((id) => id.startsWith(REMINDER_ID_PREFIX));
}

export interface ReminderSyncResult {
  scheduled: number;
  next: Date | null;
}

/**
 * Make the phone's pending reminders match the schedules exactly: one notification per upcoming dose (about two weeks
 * ahead), computed in each schedule's own time zone, stopping at the end date, absent for paused or out-of-date
 * schedules. Safe to call as often as you like: doses already scheduled are left alone and stale ones are removed,
 * so edits and repeated syncs can never leave duplicates. Only our own notifications are ever cancelled.
 */
export async function syncLocalReminders(
  schedules: MedicationSchedule[],
  options: { showMedicineNames?: boolean; force?: boolean; now?: Date } = {},
): Promise<ReminderSyncResult> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: "Medication reminders (this phone only)", importance: Notifications.AndroidImportance.DEFAULT });
  }
  const plan = planReminders(schedules, options.now ?? new Date());
  const { cancel, add } = diffReminders(await ownScheduledIds(), plan, options.force);
  await Promise.all(cancel.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  for (const item of add) {
    await Notifications.scheduleNotificationAsync({
      identifier: item.identifier,
      content: reminderContent(item, options.showMedicineNames ?? false),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.at, channelId: CHANNEL_ID },
    });
  }
  return { scheduled: plan.length, next: plan[0]?.at ?? null };
}

/** Remove only this app's medication reminders (for example on sign-out). */
export async function cancelLocalReminders(): Promise<void> {
  try {
    await Promise.all((await ownScheduledIds()).map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  } catch {
    // nothing scheduled, or notifications unavailable on this device
  }
}

export async function countLocalReminders(): Promise<number> {
  try {
    return (await ownScheduledIds()).length;
  } catch {
    return 0;
  }
}
