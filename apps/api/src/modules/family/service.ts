import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { authorizePatientData } from "../access/patientAccess.js";
import { recordAudit } from "../audit/audit.js";
import { ownPatientId } from "../patients/ownPatient.js";
import {
  getGeneration,
  RELATIONSHIP_LABELS,
  type CreateFamilyMemberInput,
  type FamilyRelationship,
  type Generation,
  type QueryFamilyMembersInput,
  type UpdateFamilyMemberInput,
  type VitalStatus,
} from "./schemas.js";

interface Ctx {
  requestId: string;
}

export interface FamilyMemberDto {
  id: string;
  fullName: string;
  relationship: FamilyRelationship;
  relationshipLabel: string;
  generation: Generation;
  vitalStatus: VitalStatus;
  age: number | null;
  bloodGroup: string | null;
  conditions: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HereditaryRiskSummary {
  condition: string;
  count: number;
  members: { name: string; relationship: string; relationLabel: string }[];
}

export interface FamilyTreeResponse {
  data: FamilyMemberDto[];
  generations: {
    grandparents: FamilyMemberDto[];
    parents: FamilyMemberDto[];
    current: FamilyMemberDto[];
    children: FamilyMemberDto[];
    other: FamilyMemberDto[];
  };
  hereditaryRisks: HereditaryRiskSummary[];
  totalMembers: number;
}

function toDto(row: {
  id: string;
  fullName: string;
  relationship: FamilyRelationship;
  vitalStatus: VitalStatus;
  age: number | null;
  bloodGroup: string | null;
  conditions: string[];
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): FamilyMemberDto {
  return {
    id: row.id,
    fullName: row.fullName,
    relationship: row.relationship,
    relationshipLabel: RELATIONSHIP_LABELS[row.relationship] ?? row.relationship,
    generation: getGeneration(row.relationship),
    vitalStatus: row.vitalStatus,
    age: row.age,
    bloodGroup: row.bloodGroup,
    conditions: row.conditions,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listFamilyMembers(
  db: Db,
  auth: AuthContext,
  query: QueryFamilyMembersInput,
  ctx: Ctx,
): Promise<FamilyTreeResponse> {
  const targetPatientId = query.patientId ?? (auth.role === "patient" ? await ownPatientId(db, auth) : undefined);
  if (!targetPatientId) throw new AppError("VALIDATION_ERROR");

  await authorizePatientData(db, auth, targetPatientId, "health_history:read", {
    requestId: ctx.requestId,
    resourceType: "family_members",
  });

  const rows = await db.familyMember.findMany({
    where: { patientId: targetPatientId },
    orderBy: [{ createdAt: "asc" }],
  });

  const members = rows.map(toDto);

  const generations = {
    grandparents: members.filter((m) => m.generation === "grandparents"),
    parents: members.filter((m) => m.generation === "parents"),
    current: members.filter((m) => m.generation === "current"),
    children: members.filter((m) => m.generation === "children"),
    other: members.filter((m) => m.generation === "other"),
  };

  const riskMap = new Map<string, { name: string; relationship: string; relationLabel: string }[]>();
  for (const m of members) {
    for (const cond of m.conditions) {
      const trimmed = cond.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      const existing = riskMap.get(key) ?? [];
      existing.push({ name: m.fullName, relationship: m.relationship, relationLabel: m.relationshipLabel });
      riskMap.set(key, existing);
    }
  }

  const hereditaryRisks: HereditaryRiskSummary[] = Array.from(riskMap.entries())
    .map(([rawKey, list]) => {

      const conditionName = list[0]?.name
        ? members.flatMap((m) => m.conditions).find((c) => c.toLowerCase() === rawKey) ?? rawKey
        : rawKey;
      return {
        condition: conditionName,
        count: list.length,
        members: list,
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    data: members,
    generations,
    hereditaryRisks,
    totalMembers: members.length,
  };
}

export async function addFamilyMember(
  db: Db,
  auth: AuthContext,
  input: CreateFamilyMemberInput,
  ctx: Ctx,
): Promise<FamilyMemberDto> {
  const patientId = await ownPatientId(db, auth);

  const row = await db.$transaction(async (tx) => {
    const count = await tx.familyMember.count({ where: { patientId } });
    if (count >= 50) throw new AppError("CONFLICT", "Maximum family members reached (50)");

    const created = await tx.familyMember.create({
      data: {
        patientId,
        fullName: input.fullName,
        relationship: input.relationship,
        vitalStatus: input.vitalStatus,
        age: input.age ?? null,
        bloodGroup: input.bloodGroup ?? null,
        conditions: input.conditions,
        notes: input.notes ?? null,
      },
    });

    await recordAudit(tx, {
      action: "patient.family_member_added",
      outcome: "success",
      actorUserId: auth.userId,
      patientId,
      resourceType: "family_member",
      resourceId: created.id,
      requestId: ctx.requestId,
      metadata: {
        relationship: input.relationship,
      },
    });

    return created;
  });

  return toDto(row);
}

export async function updateFamilyMember(
  db: Db,
  auth: AuthContext,
  id: string,
  input: UpdateFamilyMemberInput,
  ctx: Ctx,
): Promise<FamilyMemberDto> {
  const patientId = await ownPatientId(db, auth);

  const row = await db.$transaction(async (tx) => {
    const existing = await tx.familyMember.findFirst({
      where: { id, patientId },
    });
    if (!existing) throw new AppError("NOT_FOUND");

    const updated = await tx.familyMember.update({
      where: { id },
      data: {
        fullName: input.fullName,
        relationship: input.relationship,
        vitalStatus: input.vitalStatus,
        age: input.age !== undefined ? input.age : undefined,
        bloodGroup: input.bloodGroup !== undefined ? input.bloodGroup : undefined,
        conditions: input.conditions,
        notes: input.notes !== undefined ? input.notes : undefined,
      },
    });

    await recordAudit(tx, {
      action: "patient.family_member_updated",
      outcome: "success",
      actorUserId: auth.userId,
      patientId,
      resourceType: "family_member",
      resourceId: updated.id,
      requestId: ctx.requestId,
      metadata: {
        changedFields: Object.keys(input),
      },
    });

    return updated;
  });

  return toDto(row);
}

export async function deleteFamilyMember(
  db: Db,
  auth: AuthContext,
  id: string,
  ctx: Ctx,
): Promise<{ success: boolean; deletedId: string }> {
  const patientId = await ownPatientId(db, auth);

  await db.$transaction(async (tx) => {
    const existing = await tx.familyMember.findFirst({
      where: { id, patientId },
    });
    if (!existing) throw new AppError("NOT_FOUND");

    await tx.familyMember.delete({ where: { id } });

    await recordAudit(tx, {
      action: "patient.family_member_deleted",
      outcome: "success",
      actorUserId: auth.userId,
      patientId,
      resourceType: "family_member",
      resourceId: id,
      requestId: ctx.requestId,
      metadata: {
        relationship: existing.relationship,
      },
    });
  });

  return { success: true, deletedId: id };
}
