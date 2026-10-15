
import { request } from "./http";
import type { Patient, UpdatePatientInput } from "./types";

export interface PatientsApi {
  getMe(): Promise<Patient>;
  updateMe(input: UpdatePatientInput): Promise<Patient>;
}

const livePatientsApi: PatientsApi = {
  getMe: () => request<Patient>("/patients/me"),
  updateMe: (input) => request<Patient>("/patients/me", { method: "PATCH", json: input }),
};

export const patientsApi: PatientsApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? livePatientsApi
    : // Required only in demo builds, so demo accounts and sample data never ship in a live bundle (see README).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/records") as typeof import("@/lib/demo/records")).demoPatientsApi;
