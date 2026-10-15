
import { request } from "./http";
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

export const adminHospitalsApi: AdminHospitalsApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? liveAdminHospitalsApi
    : // Required only in demo builds, so demo accounts and sample data never ship in a live bundle (see README).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/hospitals") as typeof import("@/lib/demo/hospitals")).demoAdminHospitalsApi;
