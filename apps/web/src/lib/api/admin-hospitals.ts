import { demoAdminHospitalsApi } from "@/lib/demo/hospitals";

import { request } from "./http";
import { pick } from "./mode";
import type { Hospital, HospitalInput, UpdateHospitalInput } from "./types";

export interface AdminHospitalsApi {
  create(input: HospitalInput): Promise<Hospital>;
  update(id: string, input: UpdateHospitalInput): Promise<Hospital>;
  /** Stops patients seeing or booking this hospital. There is no reactivate call in the contract. */
  deactivate(id: string): Promise<Hospital>;
}

const path = (id: string) => `/admin/hospitals/${encodeURIComponent(id)}`;

const liveAdminHospitalsApi: AdminHospitalsApi = {
  create: (input) => request<Hospital>("/admin/hospitals", { method: "POST", json: input }),
  update: (id, input) => request<Hospital>(path(id), { method: "PATCH", json: input }),
  deactivate: (id) => request<Hospital>(`${path(id)}/deactivate`, { method: "POST" }),
};

export const adminHospitalsApi: AdminHospitalsApi = pick(liveAdminHospitalsApi, demoAdminHospitalsApi);
