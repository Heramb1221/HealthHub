import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { ownPatientId } from "../patients/ownPatient.js";
import { detectRuleBasedInteractions } from "../prescriptions/contraindications.js";

export interface EducationalFamilyInsight {
  condition: string;
  affectedRelatives: string[];
  lifestyleAdvice: string;
  disclaimer: string;
}

export interface DashboardSummaryDto {
  patient: {
    id: string;
    healthId: string;
    fullName: string | null;
    profileCompletionPercentage: number;
    bloodGroup: string | null;
    emergencyContactSet: boolean;
  };
  nextAppointment: {
    id: string;
    hospitalName: string;
    city: string | null;
    startsAt: string;
  } | null;
  nextMedicationReminder: {
    scheduleId: string;
    medicationName: string;
    dose: string;
    frequency: string;
    reminderTime: string;
  } | null;
  latestPrescription: {
    id: string;
    prescriberName: string | null;
    prescriptionDate: string | null;
    processingStatus: string;
    verificationStatus: string;
    medicationCount: number;
    hasSafetyAlerts: boolean;
    safetyAlertsCount: number;
  } | null;
  familyInsights: EducationalFamilyInsight[];
  recentActivity: Array<{
    id: string;
    action: string;
    occurredAt: string;
    outcome: string;
  }>;
}

export async function getDashboardSummary(db: Db, auth: AuthContext): Promise<DashboardSummaryDto> {
  const patientId = await ownPatientId(db, auth);

  const [patient, nextAppt, schedules, latestRx, familyMembers, recentAudit] = await Promise.all([
    db.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        healthId: true,
        fullName: true,
        dateOfBirth: true,
        gender: true,
        bloodGroup: true,
        phone: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        allergies: true,
        existingConditions: true,
      },
    }),
    db.appointment.findFirst({
      where: {
        patientId,
        status: "confirmed",
        slot: { startsAt: { gt: new Date() } },
      },
      include: {
        slot: {
          include: {
            hospital: { select: { name: true, city: true } },
          },
        },
      },
      orderBy: { slot: { startsAt: "asc" } },
    }),
    db.medicationSchedule.findMany({
      where: { patientId, isActive: true },
      orderBy: { createdAt: "desc" },
    }),
    db.prescriptionRecord.findFirst({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: { medications: true },
        },
      },
    }),
    db.familyMember.findMany({
      where: { patientId },
      select: { fullName: true, relationship: true, conditions: true },
    }),
    db.auditEvent.findMany({
      where: { patientId },
      orderBy: { occurredAt: "desc" },
      take: 5,
      select: { id: true, action: true, occurredAt: true, outcome: true },
    }),
  ]);

  if (!patient) throw new AppError("NOT_FOUND");

  // Calculate profile completion percentage
  let completedPoints = 0;
  const totalPoints = 7;
  if (patient.fullName) completedPoints++;
  if (patient.dateOfBirth) completedPoints++;
  if (patient.gender) completedPoints++;
  if (patient.bloodGroup) completedPoints++;
  if (patient.phone) completedPoints++;
  if (patient.emergencyContactName && patient.emergencyContactPhone) completedPoints++;
  if (patient.allergies.length > 0 || patient.existingConditions.length > 0) completedPoints++;
  const profileCompletionPercentage = Math.round((completedPoints / totalPoints) * 100);

  // Next reminder from schedules
  let nextReminder: DashboardSummaryDto["nextMedicationReminder"] = null;
  const firstActive = schedules[0];
  if (firstActive) {
    const time = firstActive.reminderTimes[0] || "09:00";
    nextReminder = {
      scheduleId: firstActive.id,
      medicationName: firstActive.medicationName,
      dose: firstActive.dose,
      frequency: firstActive.frequency,
      reminderTime: time,
    };
  }

  // Latest prescription & safety checks
  let latestRxSummary: DashboardSummaryDto["latestPrescription"] = null;
  if (latestRx) {
    const latestVersion = latestRx.versions[0];
    const meds = latestVersion?.medications ?? [];
    const alerts = detectRuleBasedInteractions(meds);

    latestRxSummary = {
      id: latestRx.id,
      prescriberName: latestVersion?.prescriberName ?? null,
      prescriptionDate: latestVersion?.prescriptionDate?.toISOString().slice(0, 10) ?? null,
      processingStatus: latestRx.processingStatus,
      verificationStatus: latestVersion?.verificationStatus ?? "unverified",
      medicationCount: meds.length,
      hasSafetyAlerts: alerts.length > 0,
      safetyAlertsCount: alerts.length,
    };
  }

  // Educational Family Risk Insights
  const familyInsights: EducationalFamilyInsight[] = [];
  const conditionMap = new Map<string, string[]>();
  for (const member of familyMembers) {
    for (const cond of member.conditions) {
      const lower = cond.toLowerCase().trim();
      const existing = conditionMap.get(lower) || [];
      existing.push(`${member.fullName} (${member.relationship})`);
      conditionMap.set(lower, existing);
    }
  }

  if (conditionMap.has("diabetes") || conditionMap.has("type 2 diabetes")) {
    familyInsights.push({
      condition: "Type 2 Diabetes Mellitus",
      affectedRelatives: conditionMap.get("diabetes") || conditionMap.get("type 2 diabetes") || [],
      lifestyleAdvice:
        "Family history of diabetes increases your predisposition. Consider annual HbA1c screening, a balanced low-glycemic diet, and 150 minutes of moderate physical activity weekly.",
      disclaimer: "Educational health insight based on self-reported family history. Not a genetic diagnosis.",
    });
  }
  if (conditionMap.has("hypertension") || conditionMap.has("high blood pressure")) {
    familyInsights.push({
      condition: "Essential Hypertension",
      affectedRelatives: conditionMap.get("hypertension") || conditionMap.get("high blood pressure") || [],
      lifestyleAdvice:
        "Regular resting blood pressure checks are recommended. Adopt a low-sodium diet and practice stress-reduction techniques.",
      disclaimer: "Educational health insight based on self-reported family history. Not a genetic diagnosis.",
    });
  }
  if (conditionMap.has("cardiac") || conditionMap.has("heart disease") || conditionMap.has("heart attack")) {
    familyInsights.push({
      condition: "Cardiovascular Disease",
      affectedRelatives: conditionMap.get("cardiac") || conditionMap.get("heart disease") || [],
      lifestyleAdvice:
        "Discuss periodic lipid profile tests and cardiac health checkups with your physician.",
      disclaimer: "Educational health insight based on self-reported family history. Not a genetic diagnosis.",
    });
  }

  return {
    patient: {
      id: patient.id,
      healthId: patient.healthId,
      fullName: patient.fullName,
      profileCompletionPercentage,
      bloodGroup: patient.bloodGroup,
      emergencyContactSet: Boolean(patient.emergencyContactName && patient.emergencyContactPhone),
    },
    nextAppointment: nextAppt
      ? {
          id: nextAppt.id,
          hospitalName: nextAppt.slot.hospital.name,
          city: nextAppt.slot.hospital.city,
          startsAt: nextAppt.slot.startsAt.toISOString(),
        }
      : null,
    nextMedicationReminder: nextReminder,
    latestPrescription: latestRxSummary,
    familyInsights,
    recentActivity: recentAudit.map((a) => ({
      id: a.id,
      action: a.action,
      occurredAt: a.occurredAt.toISOString(),
      outcome: a.outcome,
    })),
  };
}
