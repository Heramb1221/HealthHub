import { request } from "./http";
import type {
  CreateFamilyMemberInput,
  FamilyMember,
  FamilyTreeResult,
  UpdateFamilyMemberInput,
} from "./types";

export interface FamilyApi {
  list(patientId?: string): Promise<FamilyTreeResult>;
  create(input: CreateFamilyMemberInput): Promise<FamilyMember>;
  update(id: string, input: UpdateFamilyMemberInput): Promise<FamilyMember>;
  remove(id: string): Promise<{ success: boolean; deletedId: string }>;
}

function unwrapData<T>(res: T | { data: T }): T {
  if (res && typeof res === "object" && "data" in res && (res as { data: T }).data !== undefined) {
    return (res as { data: T }).data;
  }
  return res as T;
}

const liveFamilyApi: FamilyApi = {
  list: (patientId) => {
    const qs = patientId ? `?patientId=${encodeURIComponent(patientId)}` : "";
    return request<FamilyTreeResult>(`/family-members${qs}`);
  },
  create: async (input) => {
    const res = await request<FamilyMember | { data: FamilyMember }>("/family-members", { method: "POST", json: input });
    return unwrapData(res);
  },
  update: async (id, input) => {
    const res = await request<FamilyMember | { data: FamilyMember }>(`/family-members/${encodeURIComponent(id)}`, { method: "PATCH", json: input });
    return unwrapData(res);
  },
  remove: async (id) => {
    const res = await request<{ success: boolean; deletedId: string } | { data: { success: boolean; deletedId: string } }>(
      `/family-members/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    return unwrapData(res);
  },
};

export const familyApi: FamilyApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? liveFamilyApi
    : // Required only in demo builds, so demo accounts and sample data never ship in a live bundle.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/family") as typeof import("@/lib/demo/family")).demoFamilyApi;
