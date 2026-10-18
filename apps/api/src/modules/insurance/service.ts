import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { INDIAN_INSURANCE_PROVIDERS, type InsuranceProviderInfo } from "./providers.js";

export interface CreatePolicyInput {
  providerName: string;
  policyNumber: string;
  policyHolderName?: string;
  sumInsured?: string;
  validFrom?: string;
  validTill?: string;
  tpaContact?: string;
  notes?: string;
}

export function maskPolicyNumber(num: string): string {
  const clean = num.trim();
  if (clean.length <= 4) return "•••• " + clean;
  const lastFour = clean.slice(-4);
  return "•••• •••• " + lastFour;
}

export async function listInsuranceProviders(): Promise<InsuranceProviderInfo[]> {
  return INDIAN_INSURANCE_PROVIDERS;
}

export async function listPatientPolicies(db: Db, auth: AuthContext) {
  const patient = await db.patient.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });
  if (!patient) throw new AppError("NOT_FOUND");

  const policies = await db.patientInsurancePolicy.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: "desc" },
  });

  return policies.map((p) => ({
    id: p.id,
    providerName: p.providerName,
    maskedPolicyNumber: maskPolicyNumber(p.policyNumber),
    rawPolicyNumberLastFour: p.policyNumber.slice(-4),
    policyHolderName: p.policyHolderName,
    sumInsured: p.sumInsured,
    validFrom: p.validFrom ? p.validFrom.toISOString().split("T")[0] : null,
    validTill: p.validTill ? p.validTill.toISOString().split("T")[0] : null,
    tpaContact: p.tpaContact,
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
  }));
}

export async function createPatientPolicy(db: Db, auth: AuthContext, input: CreatePolicyInput) {
  const patient = await db.patient.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });
  if (!patient) throw new AppError("NOT_FOUND");

  const created = await db.patientInsurancePolicy.create({
    data: {
      patientId: patient.id,
      providerName: input.providerName,
      policyNumber: input.policyNumber.trim(),
      policyHolderName: input.policyHolderName,
      sumInsured: input.sumInsured,
      validFrom: input.validFrom ? new Date(input.validFrom) : null,
      validTill: input.validTill ? new Date(input.validTill) : null,
      tpaContact: input.tpaContact,
      notes: input.notes,
    },
  });

  return {
    id: created.id,
    providerName: created.providerName,
    maskedPolicyNumber: maskPolicyNumber(created.policyNumber),
    policyHolderName: created.policyHolderName,
    sumInsured: created.sumInsured,
    validFrom: created.validFrom ? created.validFrom.toISOString().split("T")[0] : null,
    validTill: created.validTill ? created.validTill.toISOString().split("T")[0] : null,
    tpaContact: created.tpaContact,
    notes: created.notes,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function deletePatientPolicy(db: Db, auth: AuthContext, policyId: string) {
  const patient = await db.patient.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });
  if (!patient) throw new AppError("NOT_FOUND");

  const existing = await db.patientInsurancePolicy.findFirst({
    where: { id: policyId, patientId: patient.id },
  });
  if (!existing) throw new AppError("NOT_FOUND");

  await db.patientInsurancePolicy.delete({
    where: { id: policyId },
  });

  return { success: true, id: policyId };
}
