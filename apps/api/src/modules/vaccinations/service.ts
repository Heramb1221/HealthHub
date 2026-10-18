import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { parseDateOnly } from "../../lib/text.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { authorizePatientData } from "../access/patientAccess.js";
import { recordAudit } from "../audit/audit.js";
import { ownPatientId } from "../patients/ownPatient.js";
import { VACCINE_CATALOG, type VaccineCategory } from "./catalog.js";
import type { QueryVaccinationsInput, RecordVaccinationInput } from "./schemas.js";

interface Ctx {
  requestId: string;
}

export interface PatientVaccinationDto {
  recordId: string | null;
  vaccineId: string | null;
  vaccineName: string;
  category: VaccineCategory;
  categoryLabel: string;
  description: string;
  status: "taken" | "not_taken" | null;
  administeredDate: string | null;
  notes: string | null;
  isCustom: boolean;
  updatedAt: string | null;
}

export interface VaccinationListResponse {
  data: PatientVaccinationDto[];
  summary: {
    total: number;
    taken: number;
    notTaken: number;
    unrecorded: number;
  };
}

export async function listVaccinations(
  db: Db,
  auth: AuthContext,
  query: QueryVaccinationsInput,
  ctx: Ctx,
): Promise<VaccinationListResponse> {
  const targetPatientId = query.patientId ?? (auth.role === "patient" ? await ownPatientId(db, auth) : undefined);
  if (!targetPatientId) throw new AppError("VALIDATION_ERROR");

  await authorizePatientData(db, auth, targetPatientId, "health_history:read", {
    requestId: ctx.requestId,
    resourceType: "patient_vaccinations",
  });

  const storedRows = await db.patientVaccination.findMany({
    where: { patientId: targetPatientId },
    orderBy: { createdAt: "asc" },
  });

  // Map of lowercase name -> stored row
  const rowMap = new Map<string, (typeof storedRows)[number]>();
  for (const row of storedRows) {
    rowMap.set(row.vaccineName.toLowerCase().trim(), row);
    if (row.vaccineId) {
      rowMap.set(row.vaccineId.toLowerCase().trim(), row);
    }
  }

  const items: PatientVaccinationDto[] = [];
  const processedRowIds = new Set<string>();

  // 1. Process catalog items
  for (const cat of VACCINE_CATALOG) {
    const matched = rowMap.get(cat.name.toLowerCase().trim()) ?? rowMap.get(cat.id.toLowerCase().trim());
    if (matched) processedRowIds.add(matched.id);

    items.push({
      recordId: matched?.id ?? null,
      vaccineId: cat.id,
      vaccineName: cat.name,
      category: cat.category,
      categoryLabel: cat.categoryLabel,
      description: cat.description,
      status: matched?.status ?? null,
      administeredDate: matched?.administeredDate ? matched.administeredDate.toISOString().slice(0, 10) : null,
      notes: matched?.notes ?? null,
      isCustom: false,
      updatedAt: matched?.updatedAt ? matched.updatedAt.toISOString() : null,
    });
  }

  // 2. Process custom items not in directory
  for (const row of storedRows) {
    if (!processedRowIds.has(row.id)) {
      items.push({
        recordId: row.id,
        vaccineId: row.vaccineId,
        vaccineName: row.vaccineName,
        category: (row.category as VaccineCategory) || "custom",
        categoryLabel: "Other Vaccines",
        description: row.notes || "Self-reported vaccine record.",
        status: row.status,
        administeredDate: row.administeredDate ? row.administeredDate.toISOString().slice(0, 10) : null,
        notes: row.notes,
        isCustom: true,
        updatedAt: row.updatedAt.toISOString(),
      });
    }
  }

  // Summary counts across all items
  const summary = {
    total: items.length,
    taken: items.filter((i) => i.status === "taken").length,
    notTaken: items.filter((i) => i.status === "not_taken").length,
    unrecorded: items.filter((i) => i.status === null).length,
  };

  // Optional category / status filters
  let filtered = items;
  if (query.category) {
    filtered = filtered.filter((i) => i.category === query.category);
  }
  if (query.status) {
    filtered = filtered.filter((i) => i.status === query.status);
  }

  return {
    data: filtered,
    summary,
  };
}

export async function recordVaccination(
  db: Db,
  auth: AuthContext,
  input: RecordVaccinationInput,
  ctx: Ctx,
): Promise<PatientVaccinationDto> {
  const patientId = await ownPatientId(db, auth);

  // Check if name matches catalog
  const catalogMatch = VACCINE_CATALOG.find(
    (c) =>
      c.name.toLowerCase().trim() === input.vaccineName.toLowerCase().trim() ||
      (input.vaccineId && c.id.toLowerCase() === input.vaccineId.toLowerCase()),
  );

  const finalName = catalogMatch ? catalogMatch.name : input.vaccineName;
  const finalCategory = catalogMatch ? catalogMatch.category : input.category || "custom";
  const finalCategoryLabel = catalogMatch ? catalogMatch.categoryLabel : "Other Vaccines";
  const finalDescription = catalogMatch ? catalogMatch.description : (input.notes ?? "Self-reported vaccine record.");

  const row = await db.$transaction(async (tx) => {
    const upserted = await tx.patientVaccination.upsert({
      where: {
        patientId_vaccineName: {
          patientId,
          vaccineName: finalName,
        },
      },
      create: {
        patientId,
        vaccineId: input.vaccineId ?? catalogMatch?.id ?? null,
        vaccineName: finalName,
        category: finalCategory,
        status: input.status,
        administeredDate: input.administeredDate ? parseDateOnly(input.administeredDate) : null,
        notes: input.notes ?? null,
      },
      update: {
        vaccineId: input.vaccineId ?? catalogMatch?.id ?? undefined,
        category: finalCategory,
        status: input.status,
        administeredDate: input.administeredDate !== undefined ? (input.administeredDate ? parseDateOnly(input.administeredDate) : null) : undefined,
        notes: input.notes !== undefined ? input.notes : undefined,
      },
    });

    await recordAudit(tx, {
      action: "patient.vaccination_updated",
      outcome: "success",
      actorUserId: auth.userId,
      patientId,
      resourceType: "patient_vaccination",
      resourceId: upserted.id,
      requestId: ctx.requestId,
      metadata: {
        vaccineName: finalName,
        status: input.status,
      },
    });

    return upserted;
  });

  return {
    recordId: row.id,
    vaccineId: row.vaccineId,
    vaccineName: row.vaccineName,
    category: row.category as VaccineCategory,
    categoryLabel: finalCategoryLabel,
    description: finalDescription,
    status: row.status,
    administeredDate: row.administeredDate ? row.administeredDate.toISOString().slice(0, 10) : null,
    notes: row.notes,
    isCustom: !catalogMatch,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function deleteVaccination(
  db: Db,
  auth: AuthContext,
  vaccineName: string,
  ctx: Ctx,
): Promise<{ success: boolean; clearedVaccine: string }> {
  const patientId = await ownPatientId(db, auth);

  // Search case-insensitively or exact match
  const existing = await db.patientVaccination.findFirst({
    where: {
      patientId,
      vaccineName: {
        equals: vaccineName.trim(),
        mode: "insensitive",
      },
    },
  });

  if (existing) {
    await db.$transaction(async (tx) => {
      await tx.patientVaccination.delete({
        where: { id: existing.id },
      });
      await recordAudit(tx, {
        action: "patient.vaccination_cleared",
        outcome: "success",
        actorUserId: auth.userId,
        patientId,
        resourceType: "patient_vaccination",
        resourceId: existing.id,
        requestId: ctx.requestId,
        metadata: { vaccineName: existing.vaccineName },
      });
    });
  }

  return { success: true, clearedVaccine: vaccineName };
}
