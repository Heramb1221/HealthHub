import type { Appointment } from "../api/types.ts";

export function appointmentStart(a: Appointment): string | null {
  return a.slot?.startsAt ?? a.startsAt ?? null;
}

export function appointmentHospitalName(a: Appointment): string {
  return a.hospital?.name ?? a.hospitalName ?? "Hospital";
}

/** Earliest confirmed appointment that has not started yet, or null. */
export function nextAppointment(list: Appointment[], now: Date = new Date()): Appointment | null {
  let best: { a: Appointment; t: number } | null = null;
  for (const a of list) {
    if (a.status !== "confirmed") continue;
    const start = appointmentStart(a);
    if (!start) continue;
    const t = new Date(start).getTime();
    if (Number.isNaN(t) || t < now.getTime()) continue;
    if (!best || t < best.t) best = { a, t };
  }
  return best?.a ?? null;
}
