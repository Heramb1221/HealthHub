import { Alert, Linking } from "react-native";

export interface MobileWhatsAppReminderOptions {
  patientName?: string;
  healthId?: string;
  medicationName: string;
  dosage: string;
  instructions?: string;
  timeStr?: string;
  phone?: string;
}

/**
 * Builds a WhatsApp deep-link and opens WhatsApp on the user's phone directly.
 * 100% free with zero configuration or API keys required.
 */
export async function sendWhatsAppReminder(options: MobileWhatsAppReminderOptions): Promise<void> {
  const cleanPhone = options.phone ? options.phone.replace(/[^0-9]/g, "") : "";
  const lines = [
    "🏥 *HealthHub (Sehat Med) Medication Reminder*",
    "",
    `Patient: ${options.patientName || "Patient"} (${options.healthId || "ID: Record"})`,
    `Medicine: *${options.medicationName}*`,
    `Dosage: *${options.dosage}*`,
    options.timeStr ? `Time: ${options.timeStr}` : null,
    options.instructions ? `Instructions: ${options.instructions}` : null,
    "",
    "⏰ *Action:* Please take your dose on time and mark it taken in HealthHub.",
    "",
    "_Bharat ka apna Health Sathi_",
  ].filter(Boolean);

  const text = encodeURIComponent(lines.join("\n"));
  const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;

  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert("WhatsApp not found", "Could not open WhatsApp on this device.");
    }
  } catch {
    // Fallback: try opening URL directly
    await Linking.openURL(url).catch(() => {
      Alert.alert("Unable to open WhatsApp", "Please make sure WhatsApp is installed.");
    });
  }
}
