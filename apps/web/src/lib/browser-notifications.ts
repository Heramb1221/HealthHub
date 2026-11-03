
export type BrowserNotificationState = "unsupported" | "granted" | "denied" | "default";

export function browserNotificationState(): BrowserNotificationState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<boolean> {
  if (browserNotificationState() === "unsupported") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission !== "denied") return (await Notification.requestPermission()) === "granted";
  return false;
}

export function isBrowserNotificationSupported(): boolean {
  return browserNotificationState() !== "unsupported";
}

export function isBrowserNotificationGranted(): boolean {
  return browserNotificationState() === "granted";
}

/**
 * Shows a "dose due" alert. It deliberately never names the medicine: notifications can appear on a shared or
 * locked screen. `tag` makes the browser replace, not stack, an alert for the same dose (for example in two tabs).
 */
export function showDoseAlert(tag: string): boolean {
  if (!isBrowserNotificationGranted()) return false;
  try {
    new Notification("Sehat Meds reminder", {
      body: "A dose is due. Open Sehat Meds to record it.",
      icon: "/icon.png",
      tag,
      requireInteraction: false,
    });
    return true;
  } catch {
    return false;
  }
}
