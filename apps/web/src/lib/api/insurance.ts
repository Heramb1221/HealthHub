import { request } from "./http";
import type { CreatePolicyInput, InsuranceProviderInfo, PatientInsurancePolicy } from "./types";

export interface InsuranceApi {
  listProviders(): Promise<InsuranceProviderInfo[]>;
  listPolicies(): Promise<PatientInsurancePolicy[]>;
  createPolicy(input: CreatePolicyInput): Promise<PatientInsurancePolicy>;
  deletePolicy(policyId: string): Promise<{ success: boolean }>;
}

function unwrapData<T>(res: T | { data: T }): T {
  if (res && typeof res === "object" && "data" in res && (res as { data: T }).data !== undefined) {
    return (res as { data: T }).data;
  }
  return res as T;
}

const liveInsuranceApi: InsuranceApi = {
  listProviders: async () => {
    const res = await request<InsuranceProviderInfo[] | { data: InsuranceProviderInfo[] }>("/insurance/providers");
    return unwrapData(res);
  },
  listPolicies: async () => {
    const res = await request<PatientInsurancePolicy[] | { data: PatientInsurancePolicy[] }>("/insurance/policies");
    return unwrapData(res);
  },
  createPolicy: async (input) => {
    const res = await request<PatientInsurancePolicy | { data: PatientInsurancePolicy }>("/insurance/policies", {
      method: "POST",
      json: input,
    });
    return unwrapData(res);
  },
  deletePolicy: async (policyId) => {
    const res = await request<{ success: boolean } | { data: { success: boolean } }>(
      `/insurance/policies/${encodeURIComponent(policyId)}`,
      { method: "DELETE" }
    );
    return unwrapData(res);
  },
};

export const insuranceApi: InsuranceApi = liveInsuranceApi;
