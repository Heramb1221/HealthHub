/**
 * Browser-native Notification helper.
 * Free, offline-friendly, and runs directly on the user's laptop or mobile browser.
 */

export async function requestBrowserNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  return false;
}

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function isBrowserNotificationGranted(): boolean {
  return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
}

export function triggerBrowserMedicationAlarm(options: {
  medicationName: string;
  dose: string;
  instructions?: string;
}) {
  if (!isBrowserNotificationGranted()) return;

  try {
    new Notification(`⏰ HealthHub Medication Alarm: ${options.medicationName}`, {
      body: `Dose: ${options.dose}. ${options.instructions || "Please take your scheduled medication now."}`,
      icon: "/icon.png",
      tag: `med-alarm-${options.medicationName}`,
      requireInteraction: true,
    });
  } catch {
    // Fallback if Notification constructor fails
  }
}
