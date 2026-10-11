import { demoAppointmentsApi } from "@/lib/demo/records";

import { asList, request } from "./http";
import { pick } from "./mode";
import type { Appointment } from "./types";

export interface AppointmentsApi {
  list(): Promise<Appointment[]>;
}

const liveAppointmentsApi: AppointmentsApi = {
  async list() {
    return asList(await request<Appointment[] | { items: Appointment[] }>("/appointments"));
  },
};

export const appointmentsApi: AppointmentsApi = pick(liveAppointmentsApi, demoAppointmentsApi);
