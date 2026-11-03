
import { asList, request } from "./http";
import type { Appointment, BookAppointmentInput } from "./types";

export interface AppointmentsApi {

  list(): Promise<Appointment[]>;

  book(input: BookAppointmentInput): Promise<Appointment>;
  cancel(id: string): Promise<Appointment>;
}

/**
 * The API's bookAppointmentSchema is `strictObject({ slotId })`: the slot already identifies the
 * hospital, and any extra key (such as `hospitalId`) is rejected with a validation error.
 */
export function toBookBody(input: BookAppointmentInput) {
  return { slotId: input.slotId };
}

/**
 * The API describes an appointment with `status: "confirmed"` and a nested `hospital`; the screens use
 * `status: "booked"`, `hospitalId` and `hospitalName`. Without this mapping no live appointment ever counted as
 * booked, so appointments, the dashboard and the payment options all came up empty.
 */
export function normalizeAppointment(raw: unknown): Appointment {
  const a = raw as Record<string, unknown> & { hospital?: { id?: string; name?: string; city?: string } };
  const status = a.status === "cancelled" ? "cancelled" : a.status === "completed" ? "completed" : "booked";
  return {
    ...(a as unknown as Appointment),
    status,
    hospitalId: String(a.hospitalId ?? a.hospital?.id ?? ""),
    hospitalName: String(a.hospitalName ?? a.hospital?.name ?? "Hospital"),
  };
}

const liveAppointmentsApi: AppointmentsApi = {
  async list() {
    const items = asList(await request<unknown[] | { items: unknown[] }>("/appointments")).map(normalizeAppointment);
    return items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },
  async book(input) {
    return normalizeAppointment(await request<unknown>("/appointments", { method: "POST", json: toBookBody(input) }));
  },
  async cancel(id) {
    return normalizeAppointment(await request<unknown>(`/appointments/${encodeURIComponent(id)}/cancel`, { method: "POST" }));
  },
};

export const appointmentsApi: AppointmentsApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? liveAppointmentsApi
    :
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/hospitals") as typeof import("@/lib/demo/hospitals")).demoAppointmentsApi;
