import type { Db } from "../../db/client.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { recordAudit } from "../audit/audit.js";
import { ownPatientId } from "./ownPatient.js";
import type { UpdateProfileInput } from "./schemas.js";

interface Ctx {
  requestId: string;
}

const PROFILE_SELECT = {
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
  currentMedications: true,
  address: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ProfileRow = {
  id: string;
  healthId: string;
  fullName: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  bloodGroup: string | null;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  allergies: string[];
  existingConditions: string[];
  currentMedications: string[];
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface ProfileDto {
  id: string;
  healthId: string;
  fullName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  bloodGroup: string | null;
  phone: string | null;
  emergencyContact: { name: string | null; phone: string | null };
  allergies: string[];
  existingConditions: string[];
  currentMedications: string[];
  address: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Explicit field-by-field mapping: nothing is exposed unless it is listed here. */
function toProfile(row: ProfileRow): ProfileDto {
  return {
    id: row.id,
    healthId: row.healthId,
    fullName: row.fullName,
    dateOfBirth: row.dateOfBirth ? row.dateOfBirth.toISOString().slice(0, 10) : null,
    gender: row.gender,
    bloodGroup: row.bloodGroup,
    phone: row.phone,
    emergencyContact: { name: row.emergencyContactName, phone: row.emergencyContactPhone },
    allergies: row.allergies,
    existingConditions: row.existingConditions,
    currentMedications: row.currentMedications,
    address: row.address,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getProfile(db: Db, auth: AuthContext): Promise<ProfileDto> {
  const id = await ownPatientId(db, auth);
  const row = await db.patient.findUniqueOrThrow({ where: { id }, select: PROFILE_SELECT });
  return toProfile(row);
}

export async function updateProfile(db: Db, auth: AuthContext, input: UpdateProfileInput, ctx: Ctx): Promise<ProfileDto> {
  const id = await ownPatientId(db, auth);

  // Only keys the client actually sent are written. Names are public API names.
  const data: Record<string, unknown> = {};
  const touched: string[] = [];
  const set = (apiName: string, column: string, value: unknown) => {
    data[column] = value;
    touched.push(apiName);
  };
  if (input.fullName !== undefined) set("fullName", "fullName", input.fullName);
  if (input.dateOfBirth !== undefined) set("dateOfBirth", "dateOfBirth", input.dateOfBirth);
  if (input.gender !== undefined) set("gender", "gender", input.gender);
  if (input.bloodGroup !== undefined) set("bloodGroup", "bloodGroup", input.bloodGroup);
  if (input.phone !== undefined) set("phone", "phone", input.phone);
  if (input.emergencyContact?.name !== undefined) set("emergencyContact.name", "emergencyContactName", input.emergencyContact.name);
  if (input.emergencyContact?.phone !== undefined) set("emergencyContact.phone", "emergencyContactPhone", input.emergencyContact.phone);
  if (input.allergies !== undefined) set("allergies", "allergies", input.allergies);
  if (input.existingConditions !== undefined) set("existingConditions", "existingConditions", input.existingConditions);
  if (input.currentMedications !== undefined) set("currentMedications", "currentMedications", input.currentMedications);
  if (input.address !== undefined) set("address", "address", input.address);

  const row = await db.$transaction(async (tx) => {
    const before = await tx.patient.findUniqueOrThrow({ where: { id }, select: PROFILE_SELECT });
    const beforeRecord = before as unknown as Record<string, unknown>;

    const changedFields = touched.filter((apiName, index) => {
      const column = Object.keys(data)[index] as string;
      return JSON.stringify(beforeRecord[column] ?? null) !== JSON.stringify(data[column] ?? null);
    });
    if (changedFields.length === 0) return before; // nothing changed: no write, no audit noise

    const after = await tx.patient.update({ where: { id }, data, select: PROFILE_SELECT });
    await recordAudit(tx, {
      action: "patient.profile_updated",
      outcome: "success",
      actorUserId: auth.userId,
      patientId: id,
      resourceType: "patient_profile",
      resourceId: id,
      requestId: ctx.requestId,
      // Field NAMES only, never the values.
      metadata: { changedFields },
    });
    return after;
  });
  return toProfile(row);
}

export interface HealthCardDto {
  healthId: string;
  fullName: string | null;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  issuer: string;
  notice: string;
  generatedAt: string;
}

/**
 * Identity fields only. Deliberately excludes allergies, conditions,
 * medications, phone, and address. The healthId is a HealthHub display
 * identifier, not an official national health ID.
 */
export async function getHealthCard(db: Db, auth: AuthContext): Promise<HealthCardDto> {
  const id = await ownPatientId(db, auth);
  const row = await db.patient.findUniqueOrThrow({
    where: { id },
    select: { healthId: true, fullName: true, dateOfBirth: true, bloodGroup: true },
  });
  return {
    healthId: row.healthId,
    fullName: row.fullName,
    dateOfBirth: row.dateOfBirth ? row.dateOfBirth.toISOString().slice(0, 10) : null,
    bloodGroup: row.bloodGroup,
    issuer: "HealthHub",
    notice: "This is a HealthHub identifier. It is not an official national health ID.",
    generatedAt: new Date().toISOString(),
  };
}

/** Events a patient may see about their own record. Login and registration events are excluded. */
const ACCESS_HISTORY_ACTIONS = [
  "access.granted",
  "access.denied",
  "consent.created",
  "consent.revoked",
  "patient.profile_updated",
  "prescription.corrected",
  "qr.session_created",
  "qr.session_revoked",
];

// Only these metadata keys are shown to the patient.
const SHOWN_METADATA = ["resourceScope", "reason", "changedFields", "consentId", "granteeUserId", "versionNumber"];

export interface AccessEventDto {
  id: string;
  occurredAt: string;
  action: string;
  outcome: string;
  /** `userId` is included only for providers, whom the patient may have granted access. Never for other users. */
  actor: { type: "self" | "provider" | "other"; userId?: string };
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, string | number | string[]>;
}

export async function listAccessHistory(
  db: Db,
  auth: AuthContext,
  query: { limit: number; cursor?: string | undefined },
): Promise<{ data: AccessEventDto[]; page: { limit: number; nextCursor: string | null } }> {
  const patientId = await ownPatientId(db, auth);

  const rows = await db.auditEvent.findMany({
    where: { patientId, action: { in: ACCESS_HISTORY_ACTIONS } },
    select: {
      id: true,
      occurredAt: true,
      action: true,
      outcome: true,
      actorUserId: true,
      resourceType: true,
      resourceId: true,
      metadata: true,
      actor: { select: { role: true } },
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;

  const data = items.map((row): AccessEventDto => {
    let actor: AccessEventDto["actor"];
    if (row.actorUserId === auth.userId) actor = { type: "self" };
    else if (row.actor?.role === "provider" && row.actorUserId) actor = { type: "provider", userId: row.actorUserId };
    else actor = { type: "other" };

    const details: Record<string, string | number | string[]> = {};
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    for (const key of SHOWN_METADATA) {
      const value = meta[key];
      if (typeof value === "string" || typeof value === "number" || (Array.isArray(value) && value.every((v) => typeof v === "string"))) {
        details[key] = value as string | number | string[];
      }
    }
    return {
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      action: row.action,
      outcome: row.outcome,
      actor,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      details,
    };
  });

  return { data, page: { limit: query.limit, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null } };
}
