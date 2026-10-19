
import { ApiError } from "./errors";
import { asList, request } from "./http";
import type { CreateScheduleInput, DoseEvent, DoseEventInput, MedicationSchedule, UpdateScheduleInput } from "./types";

export interface MedicationSchedulesApi {
  list(): Promise<MedicationSchedule[]>;
  get(id: string): Promise<MedicationSchedule>;
  /** The server re-checks that the medicine is complete and reviewed before creating the schedule. */
  create(input: CreateScheduleInput): Promise<MedicationSchedule>;
  /** Reminder preferences only (times, end date, on/paused). Medicine and dose can't be edited here. */
  update(id: string, input: UpdateScheduleInput): Promise<MedicationSchedule>;
  /** Self-reported "taken" or "skipped" for one reminder slot. */
  recordDose(scheduleId: string, input: DoseEventInput): Promise<DoseEvent>;
}

const path = (id: string) => `/medication-schedules/${encodeURIComponent(id)}`;

export function normalizeSchedule(raw: unknown): MedicationSchedule {
  const item = (raw ?? {}) as Record<string, unknown>;
  const medication = (item.medication ?? {}) as Record<string, unknown>;

  const id = String(item.id ?? "");
  const prescriptionId = (item.prescriptionId as string | null) ?? null;
  const medicationName = String(item.medicationName ?? medication.name ?? "Medication");
  const strength = (item.strength as string | null) ?? (medication.strength as string | null) ?? null;
  const dose = String(item.dose ?? medication.dose ?? "");
  const frequency = (item.frequency as string | null) ?? (medication.frequency as string | null) ?? null;
  const times = Array.isArray(item.times)
    ? (item.times as string[])
    : Array.isArray(item.reminderTimes)
      ? (item.reminderTimes as string[])
      : [];
  const startDate = String(item.startDate ?? "");
  const endDate = (item.endDate as string | null) ?? null;
  const active = typeof item.active === "boolean" ? item.active : Boolean(item.isActive ?? true);

  const rawEvents = (item.doseEvents ?? item.recentDoseEvents ?? []) as Array<Record<string, unknown>>;
  const doseEvents: DoseEvent[] = Array.isArray(rawEvents)
    ? rawEvents.map((e) => ({
        id: String(e.id ?? ""),
        scheduleId: String(e.scheduleId ?? id),
        scheduledFor: String(e.scheduledFor ?? ""),
        status: (e.status === "skipped" ? "skipped" : "taken") as "taken" | "skipped",
        recordedAt: String(e.recordedAt ?? new Date().toISOString()),
      }))
    : [];

  return {
    id,
    prescriptionId,
    medicationName,
    strength,
    dose,
    frequency,
    times,
    startDate,
    endDate,
    active,
    doseEvents,
    isDemo: Boolean(item.isDemo || id.startsWith("demo-")),
  };
}

const liveSchedulesApi: MedicationSchedulesApi = {
  async list() {
    const raw = asList(await request<MedicationSchedule[] | { items: MedicationSchedule[] }>("/medication-schedules"));
    return raw.map(normalizeSchedule);
  },
  async get(id) {
    if (id.startsWith("demo-")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return (require("@/lib/demo/schedules") as typeof import("@/lib/demo/schedules")).demoSchedulesApi.get(id);
    }
    // The contract has no single-schedule GET; read it from the list.
    const found = (await liveSchedulesApi.list()).find((s) => s.id === id);
    if (!found) {
      throw new ApiError({ code: "NOT_FOUND", message: "This reminder doesn’t exist or isn’t available to you.", status: 404 });
    }
    return found;
  },
  async create(input) {
    const payload = {
      prescriptionId: input.prescriptionId,
      versionNumber: input.versionNumber ?? 1,
      medicationPosition: input.medicationIndex,
      startDate: input.startDate,
      endDate: input.endDate || null,
      reminderTimes: input.times,
      remindersEnabled: true,
      timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC",
    };
    const res = await request<unknown>("/medication-schedules", { method: "POST", json: payload });
    return normalizeSchedule(res);
  },
  async update(id, input) {
    if (id.startsWith("demo-")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return (require("@/lib/demo/schedules") as typeof import("@/lib/demo/schedules")).demoSchedulesApi.update(id, input);
    }
    const payload: Record<string, unknown> = {};
    if (input.times) payload.reminderTimes = input.times;
    if ("endDate" in input) payload.endDate = input.endDate ?? null;
    if ("active" in input) payload.isActive = input.active;
    const res = await request<unknown>(path(id), { method: "PATCH", json: payload });
    return normalizeSchedule(res);
  },
  async recordDose(scheduleId, input) {
    if (scheduleId.startsWith("demo-")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return (require("@/lib/demo/schedules") as typeof import("@/lib/demo/schedules")).demoSchedulesApi.recordDose(scheduleId, input);
    }
    return request<DoseEvent>(`${path(scheduleId)}/dose-events`, { method: "POST", json: input });
  },
};

export const medicationSchedulesApi: MedicationSchedulesApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? liveSchedulesApi
    : // Required only in demo builds, so demo accounts and sample data never ship in a live bundle (see README).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/schedules") as typeof import("@/lib/demo/schedules")).demoSchedulesApi;
