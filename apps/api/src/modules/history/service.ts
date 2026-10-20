import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { parseDateOnly } from "../../lib/text.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { authorizePatientData } from "../access/patientAccess.js";
import { recordAudit } from "../audit/audit.js";
import { ownPatientId } from "../patients/ownPatient.js";

interface Ctx {
  requestId: string;
}

export const MAX_HISTORY_ENTRIES = 200;

const SELECT = { id: true, kind: true, title: true, notes: true, diagnosedOn: true, source: true, verificationStatus: true, createdAt: true } as const;

type Row = { id: string; kind: string; title: string; notes: string | null; diagnosedOn: Date | null; source: string; verificationStatus: string; createdAt: Date };

export interface HistoryEntryDto {
  id: string;
  kind: string;
  title: string;
  notes: string | null;
  description: string | null;
  diagnosedOn: string | null;
  occurredOn: string | null;

  source: string;

  verificationStatus: string;
  createdAt: string;
}

const toDto = (r: Row): HistoryEntryDto => {
  const dateStr = r.diagnosedOn ? r.diagnosedOn.toISOString().slice(0, 10) : null;
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    notes: r.notes,
    description: r.notes,
    diagnosedOn: dateStr,
    occurredOn: dateStr,
    source: r.source,
    verificationStatus: r.verificationStatus,
    createdAt: r.createdAt.toISOString(),
  };
};

export async function listHistory(
  db: Db,
  auth: AuthContext,
  query: { limit: number; cursor?: string | undefined; patientId?: string | undefined },
  ctx: Ctx,
): Promise<{ data: HistoryEntryDto[]; page: { limit: number; nextCursor: string | null } }> {
  const target = query.patientId ?? (auth.role === "patient" ? await ownPatientId(db, auth) : undefined);
  if (!target) throw new AppError("VALIDATION_ERROR");
  await authorizePatientData(db, auth, target, "health_history:read", { requestId: ctx.requestId, resourceType: "health_history" });

  const rows = await db.healthHistoryEntry.findMany({
    where: { patientId: target },
    select: SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { data: items.map(toDto), page: { limit: query.limit, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null } };
}

export async function addCondition(
  db: Db,
  auth: AuthContext,
  input: { title: string; notes?: string | null | undefined; diagnosedOn?: string | null | undefined },
  ctx: Ctx,
): Promise<HistoryEntryDto> {
  const patientId = await ownPatientId(db, auth);
  const row = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Patient" WHERE "id" = ${patientId}::uuid FOR UPDATE`;
    if ((await tx.healthHistoryEntry.count({ where: { patientId } })) >= MAX_HISTORY_ENTRIES) throw new AppError("CONFLICT", "History entry limit reached");
    const created = await tx.healthHistoryEntry.create({
      data: {
        patientId, kind: "condition", title: input.title, notes: input.notes ?? null,
        diagnosedOn: input.diagnosedOn ? parseDateOnly(input.diagnosedOn) : null, source: "patient_reported", verificationStatus: "unverified",
      },
      select: SELECT,
    });
    await recordAudit(tx, {
      action: "health_history.condition_added", outcome: "success", actorUserId: auth.userId, patientId,
      resourceType: "health_history_entry", resourceId: created.id, requestId: ctx.requestId,
    });
    return created;
  });
  return toDto(row);
}
