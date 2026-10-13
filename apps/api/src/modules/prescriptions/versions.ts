import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";

export const VERSION_SELECT = {
  id: true,
  prescriptionId: true,
  versionNumber: true,
  kind: true,
  verificationStatus: true,
  extractionProvider: true,
  extractionConfidence: true,
  prescriptionDate: true,
  prescriberName: true,
  changedFields: true,
  createdAt: true,
  medications: {
    orderBy: { position: "asc" },
    select: { name: true, strength: true, dose: true, route: true, frequency: true, duration: true, instructions: true, confidence: true },
  },
} as const;

type VersionRow = {
  id: string;
  prescriptionId: string;
  versionNumber: number;
  kind: string;
  verificationStatus: string;
  extractionProvider: string | null;
  extractionConfidence: number | null;
  prescriptionDate: Date | null;
  prescriberName: string | null;
  changedFields: string[];
  createdAt: Date;
  medications: Array<{
    name: string | null;
    strength: string | null;
    dose: string | null;
    route: string | null;
    frequency: string | null;
    duration: string | null;
    instructions: string | null;
    confidence: number;
  }>;
};

export interface VersionDto {
  id: string;
  prescriptionId: string;
  versionNumber: number;
  kind: string;
  verificationStatus: string;
  extractionProvider: string | null;
  extractionConfidence: number | null;
  prescriptionDate: string | null;
  prescriberName: string | null;
  medications: VersionRow["medications"];
  changedFields: string[];
  createdAt: string;
}

export function toVersionDto(row: VersionRow): VersionDto {
  return {
    id: row.id,
    prescriptionId: row.prescriptionId,
    versionNumber: row.versionNumber,
    kind: row.kind,
    verificationStatus: row.verificationStatus,
    extractionProvider: row.extractionProvider,
    extractionConfidence: row.extractionConfidence,
    prescriptionDate: row.prescriptionDate ? row.prescriptionDate.toISOString().slice(0, 10) : null,
    prescriberName: row.prescriberName,
    medications: row.medications,
    changedFields: row.changedFields,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Newest first. Call only after the access guard has authorized this caller. */
export async function listVersions(
  db: Db,
  prescriptionId: string,
  query: { limit: number; cursor?: string | undefined },
): Promise<{ data: VersionDto[]; page: { limit: number; nextCursor: string | null } }> {
  const rows = await db.prescriptionVersion.findMany({
    where: { prescriptionId },
    select: VERSION_SELECT,
    orderBy: { versionNumber: "desc" },
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return {
    data: items.map(toVersionDto),
    page: { limit: query.limit, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null },
  };
}

/**
 * The newest version of the record, whatever its verification status. The
 * status is part of the response so a reader can never mistake an unverified
 * or needs_review version for a verified one. Call only after the access guard.
 */
export async function getLatestVersion(db: Db, prescriptionId: string): Promise<VersionDto> {
  const row = await db.prescriptionVersion.findFirst({
    where: { prescriptionId },
    select: VERSION_SELECT,
    orderBy: { versionNumber: "desc" },
  });
  if (!row) throw new AppError("NOT_FOUND", "No extracted version yet");
  return toVersionDto(row);
}
