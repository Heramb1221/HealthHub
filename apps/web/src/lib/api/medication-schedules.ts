import { demoSchedulesApi } from "@/lib/demo/schedules";

import { ApiError } from "./errors";
import { asList, request } from "./http";
import { pick } from "./mode";
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

const liveSchedulesApi: MedicationSchedulesApi = {
  async list() {
    return asList(await request<MedicationSchedule[] | { items: MedicationSchedule[] }>("/medication-schedules"));
  },
  async get(id) {
    // The contract has no single-schedule GET; read it from the list.
    const found = (await liveSchedulesApi.list()).find((s) => s.id === id);
    if (!found) {
      throw new ApiError({ code: "NOT_FOUND", message: "This reminder doesn’t exist or isn’t available to you.", status: 404 });
    }
    return found;
  },
  create: (input) => request<MedicationSchedule>("/medication-schedules", { method: "POST", json: input }),
  update: (id, input) => request<MedicationSchedule>(path(id), { method: "PATCH", json: input }),
  recordDose: (scheduleId, input) => request<DoseEvent>(`${path(scheduleId)}/dose-events`, { method: "POST", json: input }),
};

export const medicationSchedulesApi: MedicationSchedulesApi = pick(liveSchedulesApi, demoSchedulesApi);
