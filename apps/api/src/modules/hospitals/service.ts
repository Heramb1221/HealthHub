import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { recordAudit } from "../audit/audit.js";
import { ownPatientId } from "../patients/ownPatient.js";
import { acquireSlotHold, getHospitalSlotHolds, releaseSlotHold } from "../appointments/slotHold.js";

interface Ctx {
  requestId: string;
}

const SELECT = {
  id: true, name: true, address: true, city: true, phone: true, website: true, timings: true, locationUrl: true, specialties: true, isActive: true, isDemo: true, createdAt: true, updatedAt: true,
} as const;

type Row = {
  id: string; name: string; address: string | null; city: string | null; phone: string | null; website: string | null; timings: string | null; locationUrl: string | null; specialties: string[];
  isActive: boolean; isDemo: boolean; createdAt: Date; updatedAt: Date;
};

export interface HospitalDto {
  id: string; name: string; address: string | null; city: string | null; phone: string | null; website: string | null; timings: string | null; locationUrl: string | null; specialties: string[];
  isActive: boolean;
  /** True for seeded demo data. Clients must show it as demo, never as a real hospital. */
  isDemo: boolean;
  ratingAverage?: number;
  reviewCount?: number;
  createdAt: string; updatedAt: string;
}

export const toHospitalDto = (
  row: Row,
  stats?: { ratingAverage: number; reviewCount: number },
): HospitalDto => ({
  ...row,
  ratingAverage: stats?.ratingAverage ?? 0,
  reviewCount: stats?.reviewCount ?? 0,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const isAdmin = (auth: AuthContext) => auth.role === "admin";

export async function listHospitals(
  db: Db,
  auth: AuthContext,
  query: { limit: number; cursor?: string | undefined; q?: string | undefined; city?: string | undefined; specialty?: string | undefined; includeInactive?: "true" | "false" | undefined },
): Promise<{ data: HospitalDto[]; page: { limit: number; nextCursor: string | null } }> {
  // Only an admin may see deactivated hospitals.
  if (query.includeInactive === "true" && !isAdmin(auth)) throw new AppError("FORBIDDEN");
  const rows = await db.hospital.findMany({
    where: {
      ...(query.includeInactive === "true" ? {} : { isActive: true }),
      ...(query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {}),
      ...(query.city ? { city: { equals: query.city, mode: "insensitive" as const } } : {}),
      ...(query.specialty ? { specialties: { has: query.specialty } } : {}),
    },
    select: SELECT,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;

  const hospitalIds = items.map((h) => h.id);
  const reviewAggs =
    hospitalIds.length > 0
      ? await db.hospitalReview.groupBy({
          by: ["hospitalId"],
          _avg: { rating: true },
          _count: { _all: true },
          where: { hospitalId: { in: hospitalIds } },
        })
      : [];

  const aggMap = new Map(
    reviewAggs.map((a) => [
      a.hospitalId,
      {
        ratingAverage: a._avg.rating ? Number(a._avg.rating.toFixed(1)) : 0,
        reviewCount: a._count._all,
      },
    ]),
  );

  return {
    data: items.map((row) => toHospitalDto(row, aggMap.get(row.id))),
    page: { limit: query.limit, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null },
  };
}

/** A deactivated hospital looks like it does not exist, except to an admin. */
export async function getHospital(db: Db, auth: AuthContext, id: string): Promise<HospitalDto> {
  const row = await db.hospital.findFirst({ where: { id, ...(isAdmin(auth) ? {} : { isActive: true }) }, select: SELECT });
  if (!row) throw new AppError("NOT_FOUND");
  const agg = await db.hospitalReview.aggregate({
    where: { hospitalId: id },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return toHospitalDto(row, {
    ratingAverage: agg._avg.rating ? Number(agg._avg.rating.toFixed(1)) : 0,
    reviewCount: agg._count._all,
  });
}

export async function createHospital(
  db: Db,
  auth: AuthContext,
  input: {
    name: string;
    address?: string | null | undefined;
    city?: string | null | undefined;
    phone?: string | null | undefined;
    website?: string | null | undefined;
    timings?: string | null | undefined;
    locationUrl?: string | null | undefined;
    specialties?: string[] | undefined;
  },
  ctx: Ctx,
): Promise<HospitalDto> {
  const row = await db.$transaction(async (tx) => {
    const created = await tx.hospital.create({
      data: {
        name: input.name,
        address: input.address ?? null,
        city: input.city ?? null,
        phone: input.phone ?? null,
        website: input.website ?? null,
        timings: input.timings ?? null,
        locationUrl: input.locationUrl ?? null,
        specialties: input.specialties ?? [],
        isDemo: false,
      },
      select: SELECT,
    });
    await recordAudit(tx, { action: "hospital.created", outcome: "success", actorUserId: auth.userId, resourceType: "hospital", resourceId: created.id, requestId: ctx.requestId });
    return created;
  });
  return toHospitalDto(row);
}

export async function updateHospital(
  db: Db,
  auth: AuthContext,
  id: string,
  input: {
    name?: string | undefined;
    address?: string | null | undefined;
    city?: string | null | undefined;
    phone?: string | null | undefined;
    website?: string | null | undefined;
    timings?: string | null | undefined;
    locationUrl?: string | null | undefined;
    specialties?: string[] | undefined;
    isActive?: boolean | undefined;
  },
  ctx: Ctx,
): Promise<HospitalDto> {
  const row = await db.$transaction(async (tx) => {
    const current = await tx.hospital.findUnique({ where: { id }, select: SELECT });
    if (!current) throw new AppError("NOT_FOUND");
    const changed: string[] = [];
    const data: Record<string, unknown> = {};
    for (const key of ["name", "address", "city", "phone", "website", "timings", "locationUrl", "specialties", "isActive"] as const) {
      const value = input[key];
      if (value !== undefined && JSON.stringify(value) !== JSON.stringify(current[key])) {
        data[key] = value;
        changed.push(key);
      }
    }
    if (changed.length === 0) return current;
    const updated = await tx.hospital.update({ where: { id }, data, select: SELECT });
    await recordAudit(tx, {
      action: "hospital.updated", outcome: "success", actorUserId: auth.userId, resourceType: "hospital", resourceId: id, requestId: ctx.requestId,
      metadata: { changedFields: changed },
    });
    return updated;
  });
  return toHospitalDto(row);
}

/** Stops new bookings. Existing appointments are left as they are; nothing is cancelled silently. */
export async function deactivateHospital(db: Db, auth: AuthContext, id: string, ctx: Ctx): Promise<HospitalDto> {
  return updateHospital(db, auth, id, { isActive: false }, ctx).then(async (dto) => {
    await recordAudit(db, { action: "hospital.deactivated", outcome: "success", actorUserId: auth.userId, resourceType: "hospital", resourceId: id, requestId: ctx.requestId });
    return dto;
  });
}

export interface SlotDto {
  id: string;
  startsAt: string;
  endsAt: string;
  status: "open" | "booked" | "holding" | "held_by_me";
  expiresAt?: string;
  secondsRemaining?: number;
}

/** Upcoming slots with real-time states (open/booked/holding/held_by_me). Inactive hospitals show no slots to non-admins. */
export async function listAvailability(
  db: Db,
  auth: AuthContext,
  hospitalId: string,
  query: { from?: Date | undefined; to?: Date | undefined; limit: number; cursor?: string | undefined },
): Promise<{ data: SlotDto[]; page: { limit: number; nextCursor: string | null } }> {
  const hospital = await db.hospital.findFirst({ where: { id: hospitalId, ...(isAdmin(auth) ? {} : { isActive: true }) }, select: { id: true } });
  if (!hospital) throw new AppError("NOT_FOUND");
  const now = new Date();
  const from = query.from && query.from.getTime() > now.getTime() ? query.from : now;
  const to = query.to ?? new Date(from.getTime() + 14 * 86_400_000);
  const rows = await db.availabilitySlot.findMany({
    where: { hospitalId, startsAt: { gt: from, lt: to } },
    select: { id: true, startsAt: true, endsAt: true, appointments: { where: { status: "confirmed" }, select: { id: true }, take: 1 } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  let patientId: string | null = null;
  try {
    patientId = await ownPatientId(db, auth);
  } catch {
    // Non-patient
  }

  const activeHolds = getHospitalSlotHolds(hospitalId, patientId);
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;

  return {
    data: items.map((r): SlotDto => {
      if (r.appointments.length > 0) {
        return { id: r.id, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), status: "booked" };
      }
      const hold = activeHolds.get(r.id);
      if (hold) {
        return {
          id: r.id,
          startsAt: r.startsAt.toISOString(),
          endsAt: r.endsAt.toISOString(),
          status: hold.heldByMe ? "held_by_me" : "holding",
          expiresAt: hold.expiresAt,
          secondsRemaining: hold.secondsRemaining,
        };
      }
      return { id: r.id, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), status: "open" };
    }),
    page: { limit: query.limit, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null },
  };
}

export async function holdHospitalSlot(
  db: Db,
  auth: AuthContext,
  hospitalId: string,
  slotId: string,
): Promise<{ held: boolean; expiresAt: string; secondsRemaining: number }> {
  const patientId = await ownPatientId(db, auth);
  const slot = await db.availabilitySlot.findFirst({
    where: { id: slotId, hospitalId },
    select: { id: true, startsAt: true, appointments: { where: { status: "confirmed" }, select: { id: true } } },
  });
  if (!slot) throw new AppError("NOT_FOUND", "Slot not found");
  if (slot.appointments.length > 0) throw new AppError("CONFLICT", "This slot has already been booked");
  if (slot.startsAt.getTime() <= Date.now()) throw new AppError("CONFLICT", "This slot has already passed");

  return acquireSlotHold(slotId, hospitalId, patientId, auth.userId);
}

export async function releaseHospitalSlot(
  db: Db,
  auth: AuthContext,
  hospitalId: string,
  slotId: string,
): Promise<{ released: boolean }> {
  const patientId = await ownPatientId(db, auth);
  const released = releaseSlotHold(slotId, patientId);
  return { released };
}

/** Admin-only schedule management: creates availability slots for a hospital. */
export async function addAvailabilitySlots(
  db: Db,
  auth: AuthContext,
  hospitalId: string,
  slots: Array<{ startsAt: Date; endsAt: Date }>,
  ctx: Ctx,
): Promise<{ createdCount: number }> {
  if (!isAdmin(auth)) throw new AppError("FORBIDDEN");
  const hospital = await db.hospital.findUnique({ where: { id: hospitalId } });
  if (!hospital) throw new AppError("NOT_FOUND");

  const created = await db.$transaction(async (tx) => {
    let count = 0;
    for (const slot of slots) {
      if (slot.endsAt <= slot.startsAt) continue;
      const res = await tx.availabilitySlot.upsert({
        where: { hospitalId_startsAt: { hospitalId, startsAt: slot.startsAt } },
        create: { hospitalId, startsAt: slot.startsAt, endsAt: slot.endsAt },
        update: {},
      });
      if (res) count++;
    }

    await recordAudit(tx, {
      action: "hospital.slots_created",
      outcome: "success",
      actorUserId: auth.userId,
      resourceType: "hospital",
      resourceId: hospitalId,
      requestId: ctx.requestId,
      metadata: { count },
    });

    return count;
  });

  return { createdCount: created };
}

export interface ReviewDto {
  id: string;
  rating: number;
  reviewText: string | null;
  isVerifiedPatient: boolean;
  createdAt: string;
  patientName: string;
}

export async function listHospitalReviews(
  db: Db,
  hospitalId: string,
  callerUserId?: string,
): Promise<{ ratingAverage: number; reviewCount: number; userReview?: ReviewDto | null; reviews: ReviewDto[] }> {
  const reviews = await db.hospitalReview.findMany({
    where: { hospitalId },
    include: {
      patient: { select: { id: true, userId: true, fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const reviewCount = reviews.length;
  const ratingAverage = reviewCount > 0
    ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / reviewCount).toFixed(1))
    : 0;

  let userReview: ReviewDto | null = null;
  if (callerUserId) {
    const userRev = reviews.find((r) => r.patient.userId === callerUserId);
    if (userRev) {
      userReview = {
        id: userRev.id,
        rating: userRev.rating,
        reviewText: userRev.reviewText,
        isVerifiedPatient: userRev.isVerifiedPatient,
        createdAt: userRev.createdAt.toISOString(),
        patientName: userRev.patient.fullName ? `${userRev.patient.fullName.charAt(0)}***` : "Patient",
      };
    }
  }

  return {
    ratingAverage,
    reviewCount,
    userReview,
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      reviewText: r.reviewText,
      isVerifiedPatient: r.isVerifiedPatient,
      createdAt: r.createdAt.toISOString(),
      patientName: r.patient.fullName ? `${r.patient.fullName.charAt(0)}***` : "Patient",
    })),
  };
}

export async function createHospitalReview(
  db: Db,
  auth: AuthContext,
  hospitalId: string,
  input: { rating: number; reviewText?: string | null },
  ctx: Ctx,
): Promise<ReviewDto> {
  const patient = await db.patient.findUnique({
    where: { userId: auth.userId },
    select: { id: true, fullName: true },
  });
  if (!patient) throw new AppError("NOT_FOUND");

  const hospital = await db.hospital.findUnique({ where: { id: hospitalId } });
  if (!hospital) throw new AppError("NOT_FOUND");

  // Check if patient has visited/booked at this hospital
  const hasVisited = await db.appointment.findFirst({
    where: {
      patientId: patient.id,
      slot: { hospitalId },
    },
    select: { id: true },
  });

  const existing = await db.hospitalReview.findFirst({
    where: { hospitalId, patientId: patient.id },
  });

  const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
  const reviewText = input.reviewText?.trim().slice(0, 500) || null;

  let created;
  if (existing) {
    created = await db.hospitalReview.update({
      where: { id: existing.id },
      data: {
        rating,
        reviewText,
        isVerifiedPatient: Boolean(hasVisited),
      },
    });
  } else {
    created = await db.hospitalReview.create({
      data: {
        hospitalId,
        patientId: patient.id,
        rating,
        reviewText,
        isVerifiedPatient: Boolean(hasVisited),
      },
    });
  }

  await recordAudit(db, {
    action: existing ? "hospital.review_updated" : "hospital.review_created",
    outcome: "success",
    actorUserId: auth.userId,
    patientId: patient.id,
    resourceType: "hospital_review",
    resourceId: created.id,
    requestId: ctx.requestId,
    metadata: { hospitalId, rating: created.rating, isVerified: created.isVerifiedPatient },
  });

  return {
    id: created.id,
    rating: created.rating,
    reviewText: created.reviewText,
    isVerifiedPatient: created.isVerifiedPatient,
    createdAt: created.createdAt.toISOString(),
    patientName: patient.fullName ? `${patient.fullName.charAt(0)}***` : "Patient",
  };
}
