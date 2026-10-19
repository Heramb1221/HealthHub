import type { Db } from "../../db/client.js";
import type { Env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { sendResendEmail } from "./resend.js";

export interface UpdatePreferencesInput {
  emailEnabled?: boolean;
  appointmentsEnabled?: boolean;
  prescriptionsEnabled?: boolean;
  medicationsEnabled?: boolean;
  securityAlertsEnabled?: boolean;
}

export async function getNotificationPreferences(db: Db, auth: AuthContext) {
  const patient = await db.patient.findUnique({
    where: { userId: auth.userId },
    select: { id: true, user: { select: { email: true } } },
  });
  if (!patient) throw new AppError("NOT_FOUND");

  let pref = await db.notificationPreference.findUnique({
    where: { patientId: patient.id },
  });

  if (!pref) {
    pref = await db.notificationPreference.create({
      data: {
        patientId: patient.id,
        emailEnabled: true,
        appointmentsEnabled: true,
        prescriptionsEnabled: true,
        medicationsEnabled: true,
        securityAlertsEnabled: true,
      },
    });
  }

  return {
    email: patient.user.email,
    preferences: {
      emailEnabled: pref.emailEnabled,
      appointmentsEnabled: pref.appointmentsEnabled,
      prescriptionsEnabled: pref.prescriptionsEnabled,
      medicationsEnabled: pref.medicationsEnabled,
      securityAlertsEnabled: pref.securityAlertsEnabled,
      updatedAt: pref.updatedAt.toISOString(),
    },
  };
}

export async function updateNotificationPreferences(
  db: Db,
  auth: AuthContext,
  input: UpdatePreferencesInput,
) {
  const patient = await db.patient.findUnique({
    where: { userId: auth.userId },
    select: { id: true, user: { select: { email: true } } },
  });
  if (!patient) throw new AppError("NOT_FOUND");

  const updated = await db.notificationPreference.upsert({
    where: { patientId: patient.id },
    create: {
      patientId: patient.id,
      emailEnabled: input.emailEnabled ?? true,
      appointmentsEnabled: input.appointmentsEnabled ?? true,
      prescriptionsEnabled: input.prescriptionsEnabled ?? true,
      medicationsEnabled: input.medicationsEnabled ?? true,
      securityAlertsEnabled: input.securityAlertsEnabled ?? true,
    },
    update: {
      ...(input.emailEnabled !== undefined && { emailEnabled: input.emailEnabled }),
      ...(input.appointmentsEnabled !== undefined && { appointmentsEnabled: input.appointmentsEnabled }),
      ...(input.prescriptionsEnabled !== undefined && { prescriptionsEnabled: input.prescriptionsEnabled }),
      ...(input.medicationsEnabled !== undefined && { medicationsEnabled: input.medicationsEnabled }),
      ...(input.securityAlertsEnabled !== undefined && { securityAlertsEnabled: input.securityAlertsEnabled }),
    },
  });

  return {
    email: patient.user.email,
    preferences: {
      emailEnabled: updated.emailEnabled,
      appointmentsEnabled: updated.appointmentsEnabled,
      prescriptionsEnabled: updated.prescriptionsEnabled,
      medicationsEnabled: updated.medicationsEnabled,
      securityAlertsEnabled: updated.securityAlertsEnabled,
      updatedAt: updated.updatedAt.toISOString(),
    },
  };
}

export async function sendTestNotification(db: Db, env: Env, auth: AuthContext) {
  const patient = await db.patient.findUnique({
    where: { userId: auth.userId },
    select: { id: true, fullName: true, healthId: true, user: { select: { email: true } } },
  });
  if (!patient) throw new AppError("NOT_FOUND");

  const recipient = patient.user.email;
  const name = patient.fullName || "HealthHub Patient";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0f172a; margin-top: 0;">HealthHub Notification Test</h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.5;">Hello ${name},</p>
      <p style="color: #475569; font-size: 15px; line-height: 1.5;">
        This is a test notification confirming that email alerts via Resend are active and configured for your HealthHub profile (<strong>${patient.healthId}</strong>).
      </p>
      <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #334155; font-size: 14px;">
          You will receive safe, clinical status updates regarding your appointment bookings, prescription readings, and medication alerts.
        </p>
      </div>
      <p style="color: #94a3b8; font-size: 12px; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
        HealthHub India &bull; Personal Health Record & Care Navigation &bull; Privacy-first notifications
      </p>
    </div>
  `;

  return await sendResendEmail(env, {
    to: recipient,
    subject: "HealthHub - Notification Delivery Test",
    html,
    text: `Hello ${name},\n\nThis is a test notification confirming that email alerts via Resend are active for your HealthHub profile (${patient.healthId}).\n\nHealthHub India.`,
  });
}

export async function notifyAppointmentEvent(
  db: Db,
  env: Env,
  appointmentId: string,
  event: "booked" | "cancelled",
) {
  try {
    const appointment = await db.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            healthId: true,
            user: { select: { email: true } },
            notificationPreference: true,
          },
        },
        slot: {
          include: {
            hospital: { select: { name: true, city: true, address: true } },
          },
        },
      },
    });

    if (!appointment || !appointment.patient) return;
    const pref = appointment.patient.notificationPreference;
    if (pref && (!pref.emailEnabled || !pref.appointmentsEnabled)) return;

    const recipient = appointment.patient.user.email;
    const patientName = appointment.patient.fullName || "Patient";
    const hospitalName = appointment.slot.hospital.name;
    const dateStr = appointment.slot.startsAt.toLocaleDateString("en-IN", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const isBooked = event === "booked";
    const subject = isBooked
      ? `Appointment Confirmed - ${hospitalName}`
      : `Appointment Cancelled - ${hospitalName}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">${isBooked ? "Appointment Confirmation" : "Appointment Cancellation"}</h2>
        <p style="color: #475569; font-size: 15px;">Hello ${patientName},</p>
        <p style="color: #475569; font-size: 15px;">
          Your appointment at <strong>${hospitalName}</strong> on <strong>${dateStr}</strong> has been ${isBooked ? "confirmed" : "cancelled"}.
        </p>
        <div style="background-color: #f8fafc; border-left: 4px solid ${isBooked ? "#16a34a" : "#dc2626"}; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
          <p style="margin: 0; color: #334155; font-size: 14px;"><strong>Hospital:</strong> ${hospitalName} (${appointment.slot.hospital.city || "Clinic"})</p>
          <p style="margin: 4px 0 0 0; color: #334155; font-size: 14px;"><strong>Slot Time:</strong> ${dateStr}</p>
          <p style="margin: 4px 0 0 0; color: #334155; font-size: 14px;"><strong>HealthHub ID:</strong> ${appointment.patient.healthId}</p>
        </div>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
          HealthHub &bull; For any schedule changes, visit your dashboard.
        </p>
      </div>
    `;

    await sendResendEmail(env, {
      to: recipient,
      subject,
      html,
      text: `Hello ${patientName},\n\nYour appointment at ${hospitalName} on ${dateStr} has been ${event}.\n\nHealthHub.`,
    });
  } catch {
    // Non-blocking for primary booking transaction
  }
}

export async function notifyPrescriptionEvent(db: Db, env: Env, prescriptionId: string) {
  try {
    const rx = await db.prescriptionRecord.findUnique({
      where: { id: prescriptionId },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            healthId: true,
            user: { select: { email: true } },
            notificationPreference: true,
          },
        },
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: { prescriberName: true, verificationStatus: true },
        },
      },
    });

    if (!rx || !rx.patient) return;
    const pref = rx.patient.notificationPreference;
    if (pref && (!pref.emailEnabled || !pref.prescriptionsEnabled)) return;

    const recipient = rx.patient.user.email;
    const patientName = rx.patient.fullName || "Patient";
    const latestVersion = rx.versions[0];
    const prescriber = latestVersion?.prescriberName || "Prescription Document";

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">Prescription Extraction Completed</h2>
        <p style="color: #475569; font-size: 15px;">Hello ${patientName},</p>
        <p style="color: #475569; font-size: 15px;">
          Your uploaded prescription (${prescriber}) has finished optical processing and is now ready for your review in HealthHub.
        </p>
        <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
          <p style="margin: 0; color: #334155; font-size: 14px;"><strong>Processing Status:</strong> Completed (Unverified)</p>
          <p style="margin: 4px 0 0 0; color: #334155; font-size: 14px;"><strong>Action Required:</strong> Please review and correct any ambiguous medication entries before generating reminder schedules.</p>
        </div>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
          HealthHub &bull; Original files are preserved securely in private storage.
        </p>
      </div>
    `;

    await sendResendEmail(env, {
      to: recipient,
      subject: "HealthHub - Prescription Reading Ready for Review",
      html,
      text: `Hello ${patientName},\n\nYour uploaded prescription (${prescriber}) has finished processing and is ready for your review.\n\nHealthHub.`,
    });
  } catch {
    // Non-blocking
  }
}

export async function notifyContraindicationAlerts(
  db: Db,
  env: Env,
  prescriptionId: string,
  report: {
    alerts: Array<{
      severity: string;
      medications: string[];
      title: string;
      mechanism?: string;
      patientAdvice?: string;
      clinicalNote?: string;
      description?: string;
      recommendation?: string;
    }>;
    summary?: string;
  },
) {
  try {
    if (!report.alerts || report.alerts.length === 0) return;

    const rx = await db.prescriptionRecord.findUnique({
      where: { id: prescriptionId },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            healthId: true,
            user: { select: { email: true } },
            notificationPreference: true,
          },
        },
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: { prescriberName: true },
        },
      },
    });

    if (!rx || !rx.patient) return;
    const pref = rx.patient.notificationPreference;
    if (pref && (!pref.emailEnabled || !pref.prescriptionsEnabled)) return;

    const recipient = rx.patient.user.email;
    const patientName = rx.patient.fullName || "Patient";
    const prescriber = rx.versions[0]?.prescriberName || "Prescription Document";

    const alertsHtml = report.alerts
      .map((alert) => {
        const isHigh = alert.severity === "high";
        const borderColor = isHigh ? "#dc2626" : alert.severity === "moderate" ? "#f59e0b" : "#3b82f6";
        const badgeBg = isHigh ? "#fee2e2" : alert.severity === "moderate" ? "#fef3c7" : "#dbeafe";
        const badgeColor = isHigh ? "#991b1b" : alert.severity === "moderate" ? "#92400e" : "#1e40af";
        const desc = alert.description || alert.mechanism || alert.clinicalNote || "";
        const rec = alert.recommendation || alert.patientAdvice || "";

        return `
          <div style="background-color: #f8fafc; border-left: 4px solid ${borderColor}; padding: 14px; margin-bottom: 12px; border-radius: 4px;">
            <div style="margin-bottom: 6px;">
              <strong style="color: #0f172a; font-size: 14px;">${alert.title}</strong>
              <span style="background-color: ${badgeBg}; color: ${badgeColor}; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 12px; margin-left: 8px;">
                ${alert.severity} priority
              </span>
            </div>
            <p style="margin: 0 0 6px 0; color: #334155; font-size: 13px;">
              <strong>Interacting Medicines:</strong> ${alert.medications.join(" + ")}
            </p>
            ${desc ? `<p style="margin: 0 0 6px 0; color: #475569; font-size: 13px;">${desc}</p>` : ""}
            ${rec ? `<p style="margin: 0; color: #0f766e; font-size: 13px; font-weight: 500;"><strong>Recommendation:</strong> ${rec}</p>` : ""}
          </div>
        `;
      })
      .join("");

    const textContent = report.alerts
      .map((a) => {
        const desc = a.description || a.mechanism || a.clinicalNote || "";
        const rec = a.recommendation || a.patientAdvice || "";
        return `[${a.severity.toUpperCase()}] ${a.title} (${a.medications.join(" + ")}): ${desc} - Recommendation: ${rec}`;
      })
      .join("\n\n");

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; border: 1px solid #fed7aa; border-radius: 8px;">
        <div style="background-color: #fff7ed; border-left: 4px solid #ea580c; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px;">
          <h2 style="color: #9a3412; margin: 0 0 4px 0; font-size: 18px;">Clinical Safety Alert: Medication Interaction Detected</h2>
          <p style="color: #c2410c; margin: 0; font-size: 13px; font-weight: 500;">
            Immediate attention required before starting your scheduled doses.
          </p>
        </div>

        <p style="color: #475569; font-size: 15px;">Hello ${patientName},</p>
        <p style="color: #475569; font-size: 14px; line-height: 1.5;">
          HealthHub's automated pharmacology safety check detected potential drug-drug interactions or clinical contraindications in your prescription (${prescriber}).
        </p>

        <p style="color: #334155; font-size: 14px; font-weight: 600; margin-top: 18px; margin-bottom: 8px;">
          Flagged Interactions (${report.alerts.length}):
        </p>

        ${alertsHtml}

        <div style="background-color: #f1f5f9; padding: 12px; margin-top: 20px; border-radius: 6px; font-size: 12px; color: #64748b; line-height: 1.4;">
          <strong>Clinical Disclaimer:</strong> This automated check is informational and assists clinical safety. Never stop, change, or combine prescription medications without consulting your prescribing doctor or licensed healthcare provider.
        </div>

        <p style="color: #94a3b8; font-size: 12px; margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
          HealthHub &bull; Patient ID: ${rx.patient.healthId}
        </p>
      </div>
    `;

    await sendResendEmail(env, {
      to: recipient,
      subject: "⚠️ HealthHub Medication Safety Alert: Potential Drug Interaction Detected",
      html,
      text: `Hello ${patientName},\n\nHealthHub detected potential drug interactions in your prescription (${prescriber}):\n\n${textContent}\n\nPlease consult your prescribing physician or pharmacist before taking these medications together.\n\nHealthHub.`,
    });
  } catch {
    // Non-blocking
  }
}

