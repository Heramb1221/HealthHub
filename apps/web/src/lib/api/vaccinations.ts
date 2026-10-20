import { request } from "./http";
import type { PatientVaccination, RecordVaccinationInput, VaccinationListResult } from "./types";

export interface VaccinationsApi {
  list(query?: { category?: string; status?: string }): Promise<VaccinationListResult>;
  record(input: RecordVaccinationInput): Promise<PatientVaccination>;
  remove(vaccineName: string): Promise<{ success: boolean; clearedVaccine: string }>;
}

function unwrapData<T>(res: T | { data: T }): T {
  if (res && typeof res === "object" && "data" in res && (res as { data: T }).data !== undefined) {
    return (res as { data: T }).data;
  }
  return res as T;
}

const liveVaccinationsApi: VaccinationsApi = {
  list: (query) => {
    const params = new URLSearchParams();
    if (query?.category) params.set("category", query.category);
    if (query?.status) params.set("status", query.status);
    const qs = params.toString();
    return request<VaccinationListResult>(`/vaccinations${qs ? `?${qs}` : ""}`);
  },
  record: async (input) => {
    const payload = {
      vaccineName: input.vaccineName,
      vaccineId: input.vaccineId ?? null,
      category: input.category ?? "custom",
      status: input.status,
      administeredDate: input.administeredDate ? input.administeredDate.trim() : null,
      notes: input.notes ? input.notes.trim() : null,
    };
    const res = await request<PatientVaccination | { data: PatientVaccination }>("/vaccinations", {
      method: "POST",
      json: payload,
    });
    return unwrapData(res);
  },
  remove: async (vaccineName) => {
    const res = await request<{ success: boolean; clearedVaccine: string } | { data: { success: boolean; clearedVaccine: string } }>(
      `/vaccinations/${encodeURIComponent(vaccineName)}`,
      { method: "DELETE" }
    );
    return unwrapData(res);
  },
};

export const vaccinationsApi: VaccinationsApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? liveVaccinationsApi
    :
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/vaccinations") as typeof import("@/lib/demo/vaccinations")).demoVaccinationsApi;
