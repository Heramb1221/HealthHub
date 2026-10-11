import { demoPatientsApi } from "@/lib/demo/records";

import { request } from "./http";
import { pick } from "./mode";
import type { Patient, UpdatePatientInput } from "./types";

export interface PatientsApi {
  getMe(): Promise<Patient>;
  updateMe(input: UpdatePatientInput): Promise<Patient>;
}

const livePatientsApi: PatientsApi = {
  getMe: () => request<Patient>("/patients/me"),
  updateMe: (input) => request<Patient>("/patients/me", { method: "PATCH", json: input }),
};

export const patientsApi: PatientsApi = pick(livePatientsApi, demoPatientsApi);
