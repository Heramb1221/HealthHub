export interface WhatsAppReminderOptions {
  patientName?: string;
  healthId?: string;
  medicationName: string;
  dosage: string;
  instructions?: string;
  timeStr?: string;
  phone?: string;
}

/**
 * Builds a direct, pre-filled WhatsApp click-to-chat URL (wa.me)
 * 100% free with no third-party API keys or setup required.
 */
export function buildWhatsAppReminderUrl(options: WhatsAppReminderOptions): string {
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
    "⏰ *Action:* Please take your dose on time and mark it taken in your HealthHub dashboard.",
    "",
    "_Bharat ka apna Health Sathi_",
  ].filter(Boolean);

  const text = encodeURIComponent(lines.join("\n"));
  return cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
}

/**
 * Builds a direct WhatsApp message link for appointment alerts.
 */
export function buildWhatsAppAppointmentUrl(options: {
  hospitalName: string;
  dateStr: string;
  patientName?: string;
  phone?: string;
}): string {
  const cleanPhone = options.phone ? options.phone.replace(/[^0-9]/g, "") : "";
  const lines = [
    "🏥 *HealthHub Appointment Confirmation*",
    "",
    `Hospital: *${options.hospitalName}*`,
    `Scheduled Time: *${options.dateStr}*`,
    options.patientName ? `Patient: ${options.patientName}` : null,
    "",
    "Please carry your digital HealthHub card or QR code to the reception desk.",
  ].filter(Boolean);

  const text = encodeURIComponent(lines.join("\n"));
  return cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
}
