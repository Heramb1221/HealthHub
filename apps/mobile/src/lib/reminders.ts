import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * PROTOTYPE: local, on-device reminders only.
 *
 * - They are scheduled by this phone, not delivered by the HealthHub server. They are not reliable
 *   server push: they do not fire if notifications are disabled, the app is reinstalled or its data is
 *   cleared, or the OS restricts background delivery (battery savers on some Android devices).
 * - Text is deliberately generic. Medicine names and doses are never placed in a notification, because
 *   previews can appear on a locked screen (PRODUCT_SPEC: no sensitive health data in notification previews).
 */
const CHANNEL_ID = "medication-reminders";

export type ReminderPermission = "granted" | "denied" | "undetermined";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function getReminderPermission(): Promise<ReminderPermission> {
  const res = await Notifications.getPermissionsAsync();
  if (res.granted) return "granted";
  return res.canAskAgain ? "undetermined" : "denied";
}

export async function requestReminderPermission(): Promise<ReminderPermission> {
  const res = await Notifications.requestPermissionsAsync();
  if (res.granted) return "granted";
  return res.canAskAgain ? "undetermined" : "denied";
}

/** Replaces all local reminders with one daily notification per distinct "HH:mm" time. Returns the count scheduled. */
export async function scheduleLocalReminders(times: string[]): Promise<number> {
  await cancelLocalReminders();
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Medication reminders (this phone only)",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const unique = [...new Set(times)];
  for (const time of unique) {
    const [hour, minute] = time.split(":").map(Number);
    if (hour === undefined || minute === undefined || Number.isNaN(hour) || Number.isNaN(minute)) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: "HealthHub reminder", body: "Time to check your medication schedule in HealthHub." },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL_ID },
    });
  }
  return unique.length;
}

export async function cancelLocalReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Notifications may be unavailable on this device/runtime; nothing to cancel.
  }
}

export async function countLocalReminders(): Promise<number> {
  try {
    return (await Notifications.getAllScheduledNotificationsAsync()).length;
  } catch {
    return 0;
  }
}
