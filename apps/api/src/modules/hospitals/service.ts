import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { recordAudit } from "../audit/audit.js";

interface Ctx {
  requestId: string;
}

const SELECT = {
  id: true, name: true, address: true, city: true, phone: true, specialties: true, isActive: true, isDemo: true, createdAt: true, updatedAt: true,
} as const;

type Row = {
  id: string; name: string; address: string | null; city: string | null; phone: string | null; specialties: string[];
  isActive: boolean; isDemo: boolean; createdAt: Date; updatedAt: Date;
};

export interface HospitalDto {
  id: string; name: string; address: string | null; city: string | null; phone: string | null; specialties: string[];
  isActive: boolean;
  /** True for seeded demo data. Clients must show it as demo, never as a real hospital. */
  isDemo: boolean;
  createdAt: string; updatedAt: string;
}

export const toHospitalDto = (row: Row): HospitalDto => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });

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
  return { data: items.map(toHospitalDto), page: { limit: query.limit, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null } };
}

/** A deactivated hospital looks like it does not exist, except to an admin. */
export async function getHospital(db: Db, auth: AuthContext, id: string): Promise<HospitalDto> {
  const row = await db.hospital.findFirst({ where: { id, ...(isAdmin(auth) ? {} : { isActive: true }) }, select: SELECT });
  if (!row) throw new AppError("NOT_FOUND");
  return toHospitalDto(row);
}

export async function createHospital(
  db: Db,
  auth: AuthContext,
  input: { name: string; address?: string | null | undefined; city?: string | null | undefined; phone?: string | null | undefined; specialties?: string[] | undefined },
  ctx: Ctx,
): Promise<HospitalDto> {
  const row = await db.$transaction(async (tx) => {
    const created = await tx.hospital.create({
      data: { name: input.name, address: input.address ?? null, city: input.city ?? null, phone: input.phone ?? null, specialties: input.specialties ?? [], isDemo: false },
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
  input: { name?: string | undefined; address?: string | null | undefined; city?: string | null | undefined; phone?: string | null | undefined; specialties?: string[] | undefined; isActive?: boolean | undefined },
  ctx: Ctx,
): Promise<HospitalDto> {
  const row = await db.$transaction(async (tx) => {
    const current = await tx.hospital.findUnique({ where: { id }, select: SELECT });
    if (!current) throw new AppError("NOT_FOUND");
    const changed: string[] = [];
    const data: Record<string, unknown> = {};
    for (const key of ["name", "address", "city", "phone", "specialties", "isActive"] as const) {
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

export interface SlotDto { id: string; startsAt: string; endsAt: string; status: "open" | "booked" }

/** Upcoming slots with only open/booked: never who booked them. Inactive hospitals show no slots to non-admins. */
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
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return {
    data: items.map((r): SlotDto => ({ id: r.id, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), status: r.appointments.length > 0 ? "booked" : "open" })),
    page: { limit: query.limit, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null },
  };
}
