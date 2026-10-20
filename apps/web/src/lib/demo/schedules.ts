import { ApiError } from "@/lib/api/errors";
import type { MedicationSchedulesApi } from "@/lib/api/medication-schedules";
import type { DoseEvent, MedicationSchedule } from "@/lib/api/types";
import { isInstructionSafe, medicationReviewReasons, REVIEW_REASON_LABEL } from "@/lib/prescription-safety";
import { toIsoDate } from "@/lib/schedule";

import { demoPrescriptionsApi } from "./prescriptions";
import { currentUser, isSeeded, requirePatient } from "./records";

interface State {
  created: MedicationSchedule[];
  edits: Record<string, Partial<Pick<MedicationSchedule, "times" | "endDate" | "active">>>;
  events: DoseEvent[];
}

const DAY = 86_400_000;
const key = (userId: string) => `healthhub-demo-sched:v1:${userId}`;

function load(userId: string): State {
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (raw) return JSON.parse(raw) as State;
  } catch {

  }
  return { created: [], edits: {}, events: [] };
}

function save(userId: string, state: State) {
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(state));
  } catch {
    throw new ApiError({ code: "DEMO_UNSUPPORTED", message: "Demo mode needs browser storage, which is blocked in this browser.", status: 0 });
  }
}

function at(daysAgo: number, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function seededSchedule(): MedicationSchedule {
  const events: DoseEvent[] = [
    { id: "demo-ev-1", scheduleId: "demo-sched-1", scheduledFor: at(1, "08:00"), status: "taken", recordedAt: at(1, "08:12") },
    { id: "demo-ev-2", scheduleId: "demo-sched-1", scheduledFor: at(1, "20:00"), status: "taken", recordedAt: at(1, "20:05") },
    { id: "demo-ev-3", scheduleId: "demo-sched-1", scheduledFor: at(2, "20:00"), status: "skipped", recordedAt: at(2, "21:30") },
  ];
  return {
    id: "demo-sched-1",
    prescriptionId: "demo-rx-1",
    medicationName: "Paracetamol",
    strength: "500 mg",
    dose: "1 tablet",
    frequency: "Twice a day",
    times: ["08:00", "20:00"],
    startDate: toIsoDate(new Date(Date.now() - 14 * DAY)),
    endDate: null,
    active: true,
    doseEvents: events,
    isDemo: true,
  };
}

async function all(): Promise<{ userId: string; state: State; items: MedicationSchedule[] }> {
  const user = await currentUser();
  requirePatient(user);
  const state = load(user.id);
  const base = [...(isSeeded(user) ? [seededSchedule()] : []), ...state.created];
  const items = base.map((s) => {
    const stored = state.events.filter((e) => e.scheduleId === s.id);
    return { ...s, ...state.edits[s.id], doseEvents: [...(s.doseEvents ?? []), ...stored] };
  });
  return { userId: user.id, state, items };
}

function notFound(): never {
  throw new ApiError({ code: "NOT_FOUND", message: "This reminder doesn’t exist or isn’t available to you.", status: 404 });
}

export const demoSchedulesApi: MedicationSchedulesApi = {
  async list() {
    return (await all()).items;
  },

  async get(id) {
    return (await all()).items.find((s) => s.id === id) ?? notFound();
  },

  async create(input) {
    const { userId, state, items } = await all();
    const rx = await demoPrescriptionsApi.get(input.prescriptionId);
    const med = rx.medications[input.medicationIndex];
    if (rx.processingStatus !== "completed" || !med || (med.name ?? "").toLowerCase() !== input.medicationName.toLowerCase()) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "That medicine isn’t on this prescription any more. Refresh and choose again.", status: 422 });
    }

    if (!isInstructionSafe(med)) {
      const why = medicationReviewReasons(med).map((r) => REVIEW_REASON_LABEL[r].toLowerCase()).join("; ");
      throw new ApiError({ code: "VALIDATION_ERROR", message: `This medicine needs review before it can be scheduled (${why}).`, status: 422 });
    }

    if (med.source !== "patient_entered" && rx.verificationStatus !== "verified_by_authorized_clinician" && !input.confirmedAgainstPaper) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "Confirm that you checked this medicine against your paper prescription.", status: 422 });
    }
    if (items.some((s) => s.prescriptionId === rx.id && s.medicationName.toLowerCase() === input.medicationName.toLowerCase())) {
      throw new ApiError({ code: "CONFLICT", message: "This medicine is already in your schedule.", status: 409 });
    }
    const schedule: MedicationSchedule = {
      id: `demo-sched-${crypto.randomUUID().slice(0, 8)}`,
      prescriptionId: rx.id,
      medicationName: med.name as string,
      strength: med.strength,
      dose: med.dose as string,
      frequency: med.frequency,
      times: [...input.times].sort(),
      startDate: input.startDate,
      endDate: input.endDate,
      active: true,
      doseEvents: [],
      isDemo: true,
    };
    state.created.push(schedule);
    save(userId, state);
    return schedule;
  },

  async update(id, input) {
    const { userId, state, items } = await all();
    const current = items.find((s) => s.id === id) ?? notFound();
    state.edits[id] = { ...state.edits[id], ...(input.times ? { times: [...input.times].sort() } : {}), ...("endDate" in input ? { endDate: input.endDate ?? null } : {}), ...("active" in input ? { active: input.active } : {}) };
    save(userId, state);
    return { ...current, ...state.edits[id] };
  },

  async recordDose(scheduleId, input) {
    const { userId, state, items } = await all();
    if (!items.some((s) => s.id === scheduleId)) notFound();
    const event: DoseEvent = { id: `demo-ev-${crypto.randomUUID().slice(0, 8)}`, scheduleId, scheduledFor: input.scheduledFor, status: input.status, recordedAt: new Date().toISOString() };
    state.events.push(event);
    save(userId, state);
    return event;
  },
};
