
import { asList, request } from "./http";
import type { Appointment, BookAppointmentInput } from "./types";

export interface AppointmentsApi {

  list(): Promise<Appointment[]>;

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

export const appointmentsApi: AppointmentsApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? liveAppointmentsApi
    :
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/hospitals") as typeof import("@/lib/demo/hospitals")).demoAppointmentsApi;
