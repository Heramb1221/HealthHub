import { apiUrl, authHeaders, request, requestList, type Page } from "./http.ts";
import type {
  AccessEvent,
  AddConditionBody,
  Appointment,
  AuthSession,
  AvailabilitySlot,
  CreateAppointmentBody,
  CreateQrSessionBody,
  CreateScheduleBody,
  DoseEvent,
  DoseEventBody,
  ExtractedFieldsUpdate,
  HealthCard,
  HistoryEntry,
  Hospital,
  MedicationSchedule,
  Patient,
  PatientUpdate,
  Prescription,
  PrescriptionVersionSummary,
  QrLookup,
  QrSession,
  UpdateScheduleBody,
  UploadFile,
} from "./types.ts";

/** Typed service modules. UI components call these, never `fetch` directly. Paths follow docs/API_CONTRACT.md. */

export const authApi = {
  register: (email: string, password: string) =>
    request<AuthSession>("/auth/register", { method: "POST", json: { email, password }, skipUnauthorizedHandler: true }),
  login: (email: string, password: string) =>
    request<AuthSession>("/auth/login", { method: "POST", json: { email, password }, skipUnauthorizedHandler: true }),
  /** Revokes the server-side session (backend note B1). Failure is reported, never hidden. */
  logout: () => request<void>("/auth/logout", { method: "POST", skipUnauthorizedHandler: true }),
};

export const patientApi = {
  me: (signal?: AbortSignal) => request<Patient>("/patients/me", opts(signal)),
  update: (body: PatientUpdate) => request<Patient>("/patients/me", { method: "PATCH", json: body }),
  healthCard: (signal?: AbortSignal) => request<HealthCard>("/patients/me/health-card", opts(signal)),
  accessHistory: (signal?: AbortSignal) => requestList<AccessEvent>("/patients/me/access-history", opts(signal)),
};

export const prescriptionApi = {
  list: (signal?: AbortSignal, cursor?: string) => requestList<Prescription>("/prescriptions", { ...opts(signal), query: { cursor } }),
  get: (id: string, signal?: AbortSignal) => request<Prescription>(`/prescriptions/${enc(id)}`, opts(signal)),
  versions: (id: string, signal?: AbortSignal) => requestList<PrescriptionVersionSummary>(`/prescriptions/${enc(id)}/versions`, opts(signal)),
  /** Multipart upload. Part name `file` is ASSUMED (contract says only "multipart file upload plus metadata"). */
  upload: (file: UploadFile) => {
    const form = new FormData();
    // React Native's FormData accepts { uri, name, type } as a file part.
    form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    return request<Prescription>("/prescriptions", { method: "POST", formData: form, timeoutMs: 90_000 });
  },
  process: (id: string) => request<Prescription>(`/prescriptions/${enc(id)}/process`, { method: "POST" }),
  correct: (id: string, body: ExtractedFieldsUpdate) =>
    request<Prescription>(`/prescriptions/${enc(id)}/extracted-fields`, { method: "PATCH", json: body }),
  /** URL + auth header for a native download; the bearer token is never put in the URL. */
  pdfRequest: (id: string) => ({ url: apiUrl(`/prescriptions/${enc(id)}/pdf`), headers: authHeaders() }),
};

export const qrApi = {
  createSession: (body: CreateQrSessionBody) => request<QrSession>("/qr/access-sessions", { method: "POST", json: body }),
  getSession: (sessionId: string, signal?: AbortSignal) => request<QrLookup>(`/qr/access-sessions/${enc(sessionId)}`, opts(signal)),
};

export const medicationApi = {
  list: (signal?: AbortSignal) => requestList<MedicationSchedule>("/medication-schedules", opts(signal)),
  create: (body: CreateScheduleBody) => request<MedicationSchedule>("/medication-schedules", { method: "POST", json: body }),
  update: (id: string, body: UpdateScheduleBody) =>
    request<MedicationSchedule>(`/medication-schedules/${enc(id)}`, { method: "PATCH", json: body }),
  reportDose: (id: string, body: DoseEventBody) =>
    request<DoseEvent>(`/medication-schedules/${enc(id)}/dose-events`, { method: "POST", json: body }),
};

export const historyApi = {
  list: (signal?: AbortSignal) => requestList<HistoryEntry>("/health-history", opts(signal)),
  addCondition: (body: AddConditionBody) => request<HistoryEntry>("/health-history/conditions", { method: "POST", json: body }),
};

export const hospitalApi = {
  list: (signal?: AbortSignal) => requestList<Hospital>("/hospitals", opts(signal)),
  get: (id: string, signal?: AbortSignal) => request<Hospital>(`/hospitals/${enc(id)}`, opts(signal)),
  availability: (id: string, signal?: AbortSignal) => requestList<AvailabilitySlot>(`/hospitals/${enc(id)}/availability`, opts(signal)),
};

export const appointmentApi = {
  list: (signal?: AbortSignal) => requestList<Appointment>("/appointments", opts(signal)),
  book: (body: CreateAppointmentBody) => request<Appointment>("/appointments", { method: "POST", json: body }),
  cancel: (id: string) => request<Appointment>(`/appointments/${enc(id)}/cancel`, { method: "POST" }),
};

export type { Page };

function opts(signal?: AbortSignal): { signal?: AbortSignal } {
  return signal ? { signal } : {};
}

function enc(id: string): string {
  return encodeURIComponent(id);
}
