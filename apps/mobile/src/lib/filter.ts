import type { Appointment, Hospital } from "../api/types.ts";
import { appointmentStart } from "./appointments.ts";

export function filterHospitals(list: Hospital[], query: string): Hospital[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((h) => [h.name, h.city, h.address, ...(h.specialties ?? [])].some((v) => v?.toLowerCase().includes(q)));
}

export interface AppointmentGroups {
  upcoming: Appointment[];
  past: Appointment[];
}

export function groupAppointments(list: Appointment[], now: Date = new Date()): AppointmentGroups {
  const time = (a: Appointment): number => {
    const s = appointmentStart(a);
    return s ? new Date(s).getTime() : 0;
  };
  const upcoming = list.filter((a) => a.status === "confirmed" && time(a) >= now.getTime()).sort((a, b) => time(a) - time(b));
  const past = list.filter((a) => !upcoming.includes(a)).sort((a, b) => time(b) - time(a));
  return { upcoming, past };
}
