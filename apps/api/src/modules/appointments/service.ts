import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { recordAudit } from "../audit/audit.js";
import { ownPatientId } from "../patients/ownPatient.js";

interface Ctx {
  requestId: string;
}

export const MAX_UPCOMING_APPOINTMENTS = 10;

const SELECT = {
  id: true, status: true, cancelledAt: true, createdAt: true,
  slot: { select: { id: true, startsAt: true, endsAt: true, hospital: { select: { id: true, name: true, isDemo: true } } } },
} as const;

type Row = {
  id: string; status: string; cancelledAt: Date | null; createdAt: Date;
  slot: { id: string; startsAt: Date; endsAt: Date; hospital: { id: string; name: string; isDemo: boolean } };
};

export interface AppointmentDto {
  id: string; slotId: string; status: string;
  hospital: { id: string; name: string; isDemo: boolean };
  startsAt: string; endsAt: string; cancelledAt: string | null; createdAt: string;
}

const toDto = (row: Row): AppointmentDto => ({
  id: row.id, slotId: row.slot.id, status: row.status, hospital: row.slot.hospital,
  startsAt: row.slot.startsAt.toISOString(), endsAt: row.slot.endsAt.toISOString(),
  cancelledAt: row.cancelledAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
});

const isUniqueViolation = (err: unknown): boolean => typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";

/**
 * Books a slot for the signed-in patient. Whether the slot is free is NOT
 * checked first and then acted on (which two requests could race past): the
 * insert itself claims the slot through a unique constraint, and a violation
 * means someone else got it. A per-patient lock serialises one patient's own
 * limit and overlap checks.
 */
export async function bookAppointment(db: Db, auth: AuthContext, slotId: string, ctx: Ctx): Promise<AppointmentDto> {
  const patientId = await ownPatientId(db, auth);
  const slot = await db.availabilitySlot.findUnique({ where: { id: slotId }, select: { id: true, startsAt: true, endsAt: true, hospital: { select: { id: true, isActive: true } } } });
  if (!slot) throw new AppError("NOT_FOUND");
  if (!slot.hospital.isActive) throw new AppError("CONFLICT", "This hospital is not taking bookings");
  if (slot.startsAt.getTime() <= Date.now()) throw new AppError("CONFLICT", "This slot has already started or passed");

  try {
    const row = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Patient" WHERE "id" = ${patientId}::uuid FOR UPDATE`;

      const upcoming = await tx.appointment.count({ where: { patientId, status: "confirmed", slot: { startsAt: { gt: new Date() } } } });
      if (upcoming >= MAX_UPCOMING_APPOINTMENTS) throw new AppError("CONFLICT", "Too many upcoming appointments. Cancel one first");
      const overlapping = await tx.appointment.findFirst({
        where: { patientId, status: "confirmed", slot: { startsAt: { lt: slot.endsAt }, endsAt: { gt: slot.startsAt } } },
        select: { id: true },
      });
      if (overlapping) throw new AppError("CONFLICT", "You already have an appointment at this time");

      const created = await tx.appointment.create({ data: { patientId, slotId, status: "confirmed", activeSlotId: slotId }, select: SELECT });
      await recordAudit(tx, {
        action: "appointment.booked", outcome: "success", actorUserId: auth.userId, patientId,
        resourceType: "appointment", resourceId: created.id, requestId: ctx.requestId,
        metadata: { slotId, hospitalId: slot.hospital.id },
      });
      return created;
    });
    return toDto(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError("CONFLICT", "This slot is no longer available");
    throw err;
  }
}

export async function listAppointments(
  db: Db,
  auth: AuthContext,
  query: { limit: number; cursor?: string | undefined; status?: "confirmed" | "cancelled" | undefined },
): Promise<{ data: AppointmentDto[]; page: { limit: number; nextCursor: string | null } }> {
  const patientId = await ownPatientId(db, auth);
  const rows = await db.appointment.findMany({
    where: { patientId, ...(query.status ? { status: query.status } : {}) },
    select: SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { data: items.map(toDto), page: { limit: query.limit, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null } };
}

/** Frees the slot. Repeating it is a no-op; someone else's appointment looks like it does not exist. */
export async function cancelAppointment(db: Db, auth: AuthContext, appointmentId: string, ctx: Ctx): Promise<AppointmentDto> {
  const patientId = await ownPatientId(db, auth);
  const current = await db.appointment.findFirst({ where: { id: appointmentId, patientId }, select: SELECT });
  if (!current) throw new AppError("NOT_FOUND");
  if (current.status === "cancelled") return toDto(current);
  if (current.slot.startsAt.getTime() <= Date.now()) throw new AppError("CONFLICT", "This appointment has already started or passed");

  const row = await db.$transaction(async (tx) => {
    // Conditional on still being confirmed, so two cancels cannot both act.
    const result = await tx.appointment.updateMany({
      where: { id: appointmentId, patientId, status: "confirmed" },
      data: { status: "cancelled", activeSlotId: null, cancelledAt: new Date() },
    });
    if (result.count === 1) {
      await recordAudit(tx, {
        action: "appointment.cancelled", outcome: "success", actorUserId: auth.userId, patientId,
        resourceType: "appointment", resourceId: appointmentId, requestId: ctx.requestId,
      });
    }
    return tx.appointment.findUniqueOrThrow({ where: { id: appointmentId }, select: SELECT });
  });
  return toDto(row);
}
