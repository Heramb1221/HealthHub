import { demoAppointmentsApi } from "@/lib/demo/hospitals";

import { asList, request } from "./http";
import { pick } from "./mode";
import type { Appointment, BookAppointmentInput } from "./types";

export interface AppointmentsApi {
  /** Soonest first. */
  list(): Promise<Appointment[]>;
  /**
   * Asks the server to book the slot. Resolves only when the server has confirmed it; rejects with 409 when the
   * slot was taken first. The UI must never show a booking as made before this resolves.
   */
  book(input: BookAppointmentInput): Promise<Appointment>;
  cancel(id: string): Promise<Appointment>;
}

const liveAppointmentsApi: AppointmentsApi = {
  async list() {
    const items = asList(await request<Appointment[] | { items: Appointment[] }>("/appointments"));
    return [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },
  book: (input) => request<Appointment>("/appointments", { method: "POST", json: input }),
  cancel: (id) => request<Appointment>(`/appointments/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
};

export const appointmentsApi: AppointmentsApi = pick(liveAppointmentsApi, demoAppointmentsApi);
