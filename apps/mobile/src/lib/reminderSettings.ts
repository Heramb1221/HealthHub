import * as SecureStore from "expo-secure-store";

const ENABLED = "sehatmeds.reminders.enabled";
const SHOW_NAMES = "sehatmeds.reminders.showNames";

export interface ReminderSettings {
  /** The patient asked for reminders on this phone. Re-planned automatically whenever the schedules change. */
  enabled: boolean;
  /** Opt-in: put the medicine name in the notification text (visible on the lock screen). Off by default. */
  showMedicineNames: boolean;
}

async function readFlag(key: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(key)) === "1";
  } catch {
    return false;
  }
}

async function writeFlag(key: string, value: boolean): Promise<void> {
  try {
    if (value) await SecureStore.setItemAsync(key, "1");
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // settings are best-effort; the screen still reflects the in-memory choice
  }
}

export async function loadReminderSettings(): Promise<ReminderSettings> {
  return { enabled: await readFlag(ENABLED), showMedicineNames: await readFlag(SHOW_NAMES) };
}

export const setRemindersEnabled = (value: boolean) => writeFlag(ENABLED, value);
export const setShowMedicineNames = (value: boolean) => writeFlag(SHOW_NAMES, value);
