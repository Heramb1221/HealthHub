
import { ApiError } from "./errors";
import { asList, request } from "./http";
import type { CreateScheduleInput, DoseEvent, DoseEventInput, MedicationSchedule, UpdateScheduleInput } from "./types";

export interface MedicationSchedulesApi {
  list(): Promise<MedicationSchedule[]>;
  get(id: string): Promise<MedicationSchedule>;

  create(input: CreateScheduleInput): Promise<MedicationSchedule>;

  update(id: string, input: UpdateScheduleInput): Promise<MedicationSchedule>;

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
  const timezone = typeof item.timezone === "string" && item.timezone ? item.timezone : undefined;
  const startDate = String(item.startDate ?? "");
  const endDate = (item.endDate as string | null) ?? null;
  const active = typeof item.active === "boolean" ? item.active : Boolean(item.isActive ?? true);

  const rawEvents = (item.doseEvents ?? item.recentDoseEvents ?? []) as Array<Record<string, unknown>>;
  const doseEvents: DoseEvent[] = Array.isArray(rawEvents)
    ? rawEvents.map((e) => ({
        id: String(e.id ?? ""),
        scheduleId: String(e.scheduleId ?? id),
        scheduledFor: String(e.scheduledFor ?? ""),
        // Only the two real answers are accepted; anything else is dropped below rather than shown as "taken".
        status: e.status as "taken" | "skipped",
        recordedAt: String(e.recordedAt ?? new Date().toISOString()),
      })).filter((e) => e.status === "taken" || e.status === "skipped")
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
    ...(timezone ? { timezone } : {}),
    ...(typeof item.remindersEnabled === "boolean" ? { remindersEnabled: item.remindersEnabled } : {}),
    ...(typeof item.remindersActive === "boolean" ? { remindersActive: item.remindersActive } : {}),
    ...(item.sourceStatus === "current" || item.sourceStatus === "changed" || item.sourceStatus === "removed" ? { sourceStatus: item.sourceStatus } : {}),
    ...(typeof item.sourceVersionNumber === "number" ? { sourceVersionNumber: item.sourceVersionNumber } : {}),
    active,
    doseEvents,
    isDemo: Boolean(item.isDemo || id.startsWith("demo-")),
  };
}

/** The exact body the API's strict createScheduleSchema accepts. */
export function toCreateBody(input: CreateScheduleInput & { versionNumber: number }) {
  return {
    prescriptionId: input.prescriptionId,
    versionNumber: input.versionNumber,
    medicationPosition: input.medicationIndex,
    startDate: input.startDate,
    endDate: input.endDate || null,
    reminderTimes: input.times,
    // The API refuses "reminders on" without at least one time.
    remindersEnabled: input.times.length > 0,
    timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" : "UTC",
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

    const found = (await liveSchedulesApi.list()).find((s) => s.id === id);
    if (!found) {
      throw new ApiError({ code: "NOT_FOUND", message: "This reminder doesn’t exist or isn’t available to you.", status: 404 });
    }
    return found;
  },
  async create(input) {
    // The API only makes a schedule from the prescription version the patient reviewed. A reviewed prescription is at
    // least version 2 (extraction, then the patient's correction), so assuming version 1 made every request fail.
    const versionNumber =
      input.versionNumber ?? (await request<{ versionNumber: number }>(`/prescriptions/${encodeURIComponent(input.prescriptionId)}/latest`)).versionNumber;
    const payload = toCreateBody({ ...input, versionNumber });
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
    :
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/schedules") as typeof import("@/lib/demo/schedules")).demoSchedulesApi;
