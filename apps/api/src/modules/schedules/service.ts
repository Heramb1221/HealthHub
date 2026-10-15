import type { Db } from "../../db/client.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../lib/errors.js";
import { parseDateOnly } from "../../lib/text.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { authorizePatientData } from "../access/patientAccess.js";
import { recordAudit } from "../audit/audit.js";
import { ownPatientId } from "../patients/ownPatient.js";
import { checkScheduleEligibility, REFUSAL_MESSAGE, type IneligibleReason } from "./eligibility.js";
import type { CreateScheduleInput, UpdateScheduleInput } from "./schemas.js";

interface Ctx {
  requestId: string;
}

type Reader = Db | Prisma.TransactionClient;

export const MAX_ACTIVE_SCHEDULES = 50;
const RECENT_DOSE_DAYS = 14;
const RECENT_DOSE_LIMIT = 20;
const FUTURE_TOLERANCE_MS = 60 * 60_000;
const DAY_MS = 86_400_000;

export const SCHEDULE_NOTICE =
  "A reminder plan made from a prescription record you reviewed. It is not medical advice. Follow your doctor's instructions.";

const MEDICATION_TEXT = ["name", "strength", "dose", "route", "frequency", "duration", "instructions"] as const;

const dateOnly = (date: Date): string => date.toISOString().slice(0, 10);

/** The calendar date of an instant in a time zone, as YYYY-MM-DD. */
function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

const scheduleSelect = (since: Date) =>
  ({
    id: true,
    medicationName: true,
    strength: true,
    dose: true,
    route: true,
    frequency: true,
    duration: true,
    instructions: true,
    startDate: true,
    endDate: true,
    reminderTimes: true,
    remindersEnabled: true,
    timezone: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    sourceMedication: { select: { position: true, version: { select: { prescriptionId: true, versionNumber: true } } } },
    doseEvents: {
      where: { scheduledFor: { gte: since } },
      orderBy: { scheduledFor: "desc" as const },
      take: RECENT_DOSE_LIMIT,
      select: { id: true, scheduledFor: true, status: true, recordedAt: true },
    },
  }) as const;

interface ScheduleRow {
  id: string;
  medicationName: string;
  strength: string;
  dose: string;
  route: string | null;
  frequency: string;
  duration: string | null;
  instructions: string | null;
  startDate: Date;
  endDate: Date | null;
  reminderTimes: string[];
  remindersEnabled: boolean;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  sourceMedication: { position: number; version: { prescriptionId: string; versionNumber: number } };
  doseEvents: Array<{ id: string; scheduledFor: Date; status: string; recordedAt: Date }>;
}

type SourceStatus = "current" | "changed" | "removed";

export interface ScheduleDto {
  id: string;
  prescriptionId: string;
  sourceVersionNumber: number;
  /** Whether the prescription still says what this schedule was made from. */
  sourceStatus: SourceStatus;
  medication: Record<(typeof MEDICATION_TEXT)[number], string | null>;
  startDate: string;
  endDate: string | null;
  reminderTimes: string[];
  remindersEnabled: boolean;
  /** The one flag clients should use to decide whether to remind. */
  remindersActive: boolean;
  timezone: string;
  isActive: boolean;
  recentDoseEvents: Array<{ id: string; scheduledFor: string; status: string; recordedAt: string; selfReported: true }>;
  notice: string;
  createdAt: string;
  updatedAt: string;
}

interface LatestVersion {
  prescriptionId: string;
  versionNumber: number;
  medications: Array<Record<(typeof MEDICATION_TEXT)[number], string | null> & { position: number }>;
}

/** The newest version of each given prescription, with its medication rows. */
async function latestVersions(reader: Reader, prescriptionIds: string[]): Promise<Map<string, LatestVersion>> {
  if (prescriptionIds.length === 0) return new Map();
  const rows = await reader.prescriptionVersion.findMany({
    where: { prescriptionId: { in: prescriptionIds } },
    orderBy: [{ prescriptionId: "asc" }, { versionNumber: "desc" }],
    distinct: ["prescriptionId"],
    select: {
      prescriptionId: true,
      versionNumber: true,
      medications: { select: { position: true, name: true, strength: true, dose: true, route: true, frequency: true, duration: true, instructions: true } },
    },
  });
  return new Map(rows.map((row) => [row.prescriptionId, row]));
}

function sourceStatusOf(row: ScheduleRow, latest: LatestVersion | undefined): SourceStatus {
  const source = row.sourceMedication;
  if (!latest || latest.versionNumber === source.version.versionNumber) return "current";
  const now = latest.medications.find((m) => m.position === source.position);
  if (!now) return "removed";
  const same = MEDICATION_TEXT.every((field) => {
    const copied = field === "name" ? row.medicationName : row[field];
    return now[field] === copied;
  });
  return same ? "current" : "changed";
}

async function toDtos(reader: Reader, rows: ScheduleRow[], now: Date): Promise<ScheduleDto[]> {
  const latest = await latestVersions(reader, [...new Set(rows.map((r) => r.sourceMedication.version.prescriptionId))]);
  return rows.map((row): ScheduleDto => {
    const prescriptionId = row.sourceMedication.version.prescriptionId;
    const sourceStatus = sourceStatusOf(row, latest.get(prescriptionId));
    const today = localDate(now, row.timezone);
    const start = dateOnly(row.startDate);
    const end = row.endDate ? dateOnly(row.endDate) : null;
    const inWindow = start <= today && (end === null || today <= end);
    return {
      id: row.id,
      prescriptionId,
      sourceVersionNumber: row.sourceMedication.version.versionNumber,
      sourceStatus,
      medication: {
        name: row.medicationName, strength: row.strength, dose: row.dose, route: row.route,
        frequency: row.frequency, duration: row.duration, instructions: row.instructions,
      },
      startDate: start,
      endDate: end,
      reminderTimes: row.reminderTimes,
      remindersEnabled: row.remindersEnabled,
      remindersActive: row.isActive && row.remindersEnabled && sourceStatus === "current" && inWindow,
      timezone: row.timezone,
      isActive: row.isActive,
      recentDoseEvents: row.doseEvents.map((e) => ({
        id: e.id, scheduledFor: e.scheduledFor.toISOString(), status: e.status, recordedAt: e.recordedAt.toISOString(), selfReported: true as const,
      })),
      notice: SCHEDULE_NOTICE,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

const since = (now: Date): Date => new Date(now.getTime() - RECENT_DOSE_DAYS * DAY_MS);

/** Serialises schedule changes for one patient, so limits and duplicate checks cannot be raced. */
const lockPatient = (tx: Prisma.TransactionClient, patientId: string) =>
  tx.$queryRaw`SELECT "id" FROM "Patient" WHERE "id" = ${patientId}::uuid FOR UPDATE`;

/** Another ACTIVE schedule for the same medication of the same prescription. */
async function duplicateActive(tx: Prisma.TransactionClient, patientId: string, prescriptionId: string, position: number, exceptId?: string) {
  return tx.medicationSchedule.findFirst({
    where: {
      patientId,
      isActive: true,
      ...(exceptId ? { id: { not: exceptId } } : {}),
      sourceMedication: { position, version: { prescriptionId } },
    },
    select: { id: true },
  });
}

export async function createSchedule(db: Db, auth: AuthContext, input: CreateScheduleInput, ctx: Ctx): Promise<ScheduleDto> {
  const patientId = await ownPatientId(db, auth);
  const record = await db.prescriptionRecord.findUnique({ where: { id: input.prescriptionId }, select: { patientId: true } });
  if (!record) throw new AppError("NOT_FOUND");
  // Patients pass only for their own prescription; anything else is refused and audited.
  await authorizePatientData(db, auth, record.patientId, "prescriptions:read", {
    requestId: ctx.requestId,
    resourceType: "prescription",
    resourceId: input.prescriptionId,
  });

  const refuse = async (reason: IneligibleReason | "no_version" | "version_changed", message: string): Promise<never> => {
    await recordAudit(db, {
      action: "schedule.refused",
      outcome: "denied",
      actorUserId: auth.userId,
      patientId,
      resourceType: "prescription",
      resourceId: input.prescriptionId,
      requestId: ctx.requestId,
      metadata: { reason, versionNumber: input.versionNumber, medicationPosition: input.medicationPosition },
    });
    throw new AppError("CONFLICT", message);
  };

  const latest = await db.prescriptionVersion.findFirst({
    where: { prescriptionId: input.prescriptionId },
    orderBy: { versionNumber: "desc" },
    select: {
      versionNumber: true,
      verificationStatus: true,
      medications: {
        orderBy: { position: "asc" },
        select: { id: true, position: true, name: true, strength: true, dose: true, route: true, frequency: true, duration: true, instructions: true, confidence: true },
      },
    },
  });
  if (!latest) return refuse("no_version", "The prescription has not been processed or entered yet");
  // The patient must have acted on what they saw: never schedule a different row than the one on their screen.
  if (latest.versionNumber !== input.versionNumber) return refuse("version_changed", "The prescription changed since you loaded it");

  const medication = latest.medications.find((m) => m.position === input.medicationPosition);
  if (!medication) throw new AppError("NOT_FOUND", "Medication not found");

  const eligibility = checkScheduleEligibility({ verificationStatus: latest.verificationStatus, medication });
  if (!eligibility.ok) return refuse(eligibility.reason, REFUSAL_MESSAGE[eligibility.reason]);
  // Eligibility guarantees these are present.
  const { name, strength, dose, frequency } = medication;
  if (name === null || strength === null || dose === null || frequency === null) throw new AppError("INTERNAL_ERROR");

  const now = new Date();
  const row = await db.$transaction(async (tx) => {
    await lockPatient(tx, patientId);
    if ((await tx.medicationSchedule.count({ where: { patientId, isActive: true } })) >= MAX_ACTIVE_SCHEDULES) {
      throw new AppError("CONFLICT", "Too many active schedules. Stop one first");
    }
    if (await duplicateActive(tx, patientId, input.prescriptionId, input.medicationPosition)) {
      throw new AppError("CONFLICT", "This medication already has an active schedule. Stop it before making a new one");
    }

    const created = await tx.medicationSchedule.create({
      data: {
        patientId,
        sourceMedicationId: medication.id,
        medicationName: name,
        strength,
        dose,
        route: medication.route,
        frequency,
        duration: medication.duration,
        instructions: medication.instructions,
        startDate: parseDateOnly(input.startDate) as Date,
        endDate: input.endDate ? parseDateOnly(input.endDate) : null,
        reminderTimes: input.reminderTimes ?? [],
        remindersEnabled: input.remindersEnabled ?? false,
        timezone: input.timezone,
      },
      select: scheduleSelect(since(now)),
    });
    await recordAudit(tx, {
      action: "schedule.created",
      outcome: "success",
      actorUserId: auth.userId,
      patientId,
      resourceType: "medication_schedule",
      resourceId: created.id,
      requestId: ctx.requestId,
      // Ids and positions only; never the medication text.
      metadata: { prescriptionId: input.prescriptionId, versionNumber: latest.versionNumber, medicationPosition: input.medicationPosition },
    });
    return created;
  });
  return (await toDtos(db, [row], now))[0] as ScheduleDto;
}

export async function listSchedules(
  db: Db,
  auth: AuthContext,
  query: { limit: number; cursor?: string | undefined },
): Promise<{ data: ScheduleDto[]; page: { limit: number; nextCursor: string | null } }> {
  const patientId = await ownPatientId(db, auth);
  const now = new Date();
  const rows = await db.medicationSchedule.findMany({
    where: { patientId },
    select: scheduleSelect(since(now)),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return {
    data: await toDtos(db, items, now),
    page: { limit: query.limit, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null },
  };
}

export async function updateSchedule(db: Db, auth: AuthContext, scheduleId: string, input: UpdateScheduleInput, ctx: Ctx): Promise<ScheduleDto> {
  const patientId = await ownPatientId(db, auth);
  const now = new Date();

  const row = await db.$transaction(async (tx) => {
    await lockPatient(tx, patientId);
    // Someone else's schedule looks exactly like one that does not exist.
    const current = await tx.medicationSchedule.findFirst({ where: { id: scheduleId, patientId }, select: scheduleSelect(since(now)) });
    if (!current) throw new AppError("NOT_FOUND");

    const next = {
      reminderTimes: input.reminderTimes ?? current.reminderTimes,
      remindersEnabled: input.remindersEnabled ?? current.remindersEnabled,
      timezone: input.timezone ?? current.timezone,
      endDate: input.endDate !== undefined ? (input.endDate ? parseDateOnly(input.endDate) : null) : current.endDate,
      isActive: input.isActive ?? current.isActive,
    };

    if (next.remindersEnabled && next.reminderTimes.length === 0) throw new AppError("VALIDATION_ERROR");
    if (next.endDate) {
      const start = dateOnly(current.startDate);
      const end = dateOnly(next.endDate);
      if (end < start || end > dateOnly(new Date(Date.parse(`${start}T00:00:00.000Z`) + 3650 * DAY_MS))) throw new AppError("VALIDATION_ERROR");
    }

    if (next.isActive && !current.isActive) {
      const prescriptionId = current.sourceMedication.version.prescriptionId;
      if ((await tx.medicationSchedule.count({ where: { patientId, isActive: true } })) >= MAX_ACTIVE_SCHEDULES) {
        throw new AppError("CONFLICT", "Too many active schedules. Stop one first");
      }
      if (await duplicateActive(tx, patientId, prescriptionId, current.sourceMedication.position, current.id)) {
        throw new AppError("CONFLICT", "This medication already has an active schedule");
      }
      const latest = await latestVersions(tx, [prescriptionId]);
      if (sourceStatusOf(current, latest.get(prescriptionId)) !== "current") {
        throw new AppError("CONFLICT", "The prescription has changed. Make a new schedule from its current version instead");
      }
    }

    const changedFields: string[] = [];
    if (JSON.stringify(next.reminderTimes) !== JSON.stringify(current.reminderTimes)) changedFields.push("reminderTimes");
    if (next.remindersEnabled !== current.remindersEnabled) changedFields.push("remindersEnabled");
    if (next.timezone !== current.timezone) changedFields.push("timezone");
    if ((next.endDate ? dateOnly(next.endDate) : null) !== (current.endDate ? dateOnly(current.endDate) : null)) changedFields.push("endDate");
    if (next.isActive !== current.isActive) changedFields.push("isActive");
    if (changedFields.length === 0) return current; // nothing changed: no write, no audit noise

    const updated = await tx.medicationSchedule.update({ where: { id: current.id }, data: next, select: scheduleSelect(since(now)) });
    await recordAudit(tx, {
      action: "schedule.updated",
      outcome: "success",
      actorUserId: auth.userId,
      patientId,
      resourceType: "medication_schedule",
      resourceId: current.id,
      requestId: ctx.requestId,
      metadata: { changedFields },
    });
    return updated;
  });
  return (await toDtos(db, [row], now))[0] as ScheduleDto;
}

export interface DoseEventDto {
  id: string;
  scheduleId: string;
  scheduledFor: string;
  status: string;
  recordedAt: string;
  /** Always true: the API only ever stores what the patient reports. */
  selfReported: true;
}

/**
 * Records that the patient says they took or skipped a dose. It is a
 * self-report and is stored and labelled as one; nothing in the system treats
 * it as verified. Events are append-only and unique per schedule and time.
 */
export async function recordDoseEvent(
  db: Db,
  auth: AuthContext,
  scheduleId: string,
  input: { scheduledFor: Date; status: "taken" | "skipped" },
): Promise<DoseEventDto> {
  const patientId = await ownPatientId(db, auth);
  const schedule = await db.medicationSchedule.findFirst({
    where: { id: scheduleId, patientId },
    select: { id: true, isActive: true, timezone: true, startDate: true, endDate: true },
  });
  if (!schedule) throw new AppError("NOT_FOUND");
  if (!schedule.isActive) throw new AppError("CONFLICT", "This schedule is not active");

  const now = Date.now();
  if (input.scheduledFor.getTime() > now + FUTURE_TOLERANCE_MS) throw new AppError("VALIDATION_ERROR");
  const day = localDate(input.scheduledFor, schedule.timezone);
  if (day < dateOnly(schedule.startDate) || (schedule.endDate && day > dateOnly(schedule.endDate))) throw new AppError("VALIDATION_ERROR");

  try {
    const event = await db.doseEvent.create({
      data: { scheduleId, scheduledFor: input.scheduledFor, status: input.status },
      select: { id: true, scheduleId: true, scheduledFor: true, status: true, recordedAt: true },
    });
    return {
      id: event.id,
      scheduleId: event.scheduleId,
      scheduledFor: event.scheduledFor.toISOString(),
      status: event.status,
      recordedAt: event.recordedAt.toISOString(),
      selfReported: true,
    };
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002") {
      throw new AppError("CONFLICT", "A dose is already recorded for this time");
    }
    throw err;
  }
}
