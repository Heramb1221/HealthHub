import * as Notifications from "expo-notifications";
import { Alert, Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function requestDeviceAlarmPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      Alert.alert(
        "Alarms & Notifications Disabled",
        "Enable notifications in device settings to receive timely medication dose alarms.",
      );
      return false;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("medication-alarms", {
        name: "Medication Reminders",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#0284c7",
      });
    }

    return true;
  } catch {
    return false;
  }
}

export async function scheduleMedicationAlarm(options: {
  medicationName: string;
  dose: string;
  hour: number;
  minute: number;
}): Promise<string | null> {
  const hasPermission = await requestDeviceAlarmPermissions();
  if (!hasPermission) return null;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⏰ Medicine Alarm: ${options.medicationName}`,
        body: `Time to take ${options.dose} of ${options.medicationName}. Open HealthHub to mark taken.`,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: { medicationName: options.medicationName, dose: options.dose },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: options.hour,
        minute: options.minute,
      },
    });
    return id;
  } catch {
    return null;
  }
}

export async function cancelMedicationAlarm(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {

  }
}
