import { IS_DEMO } from "./config";
import { request } from "./http";
import type { CalendarStatus, CalendarSyncResult } from "./types";

export interface CalendarApi {
  getStatus(): Promise<CalendarStatus>;
  getGoogleAuthUrl(): Promise<{ url: string }>;
  disconnect(): Promise<{ success: boolean }>;
  syncSchedules(input: { scheduleIds?: string[]; prescriptionId?: string }): Promise<CalendarSyncResult>;
}

const liveCalendarApi: CalendarApi = {
  async getStatus() {
    return request<CalendarStatus>("/calendar/status");
  },
  async getGoogleAuthUrl() {
    return request<{ url: string }>("/calendar/google/auth-url");
  },
  async disconnect() {
    return request<{ success: boolean }>("/calendar/google/disconnect", { method: "POST" });
  },
  async syncSchedules(input) {
    return request<CalendarSyncResult>("/calendar/sync-schedules", {
      method: "POST",
      json: input,
    });
  },
};

const demoCalendarApi: CalendarApi = {
  async getStatus() {
    return {
      isConfigured: true,
      connected: true,
      email: "demo-patient@healthhub.local",
      provider: "google_oauth",
    };
  },
  async getGoogleAuthUrl() {
    return { url: "#demo-google-oauth-connected" };
  },
  async disconnect() {
    return { success: true };
  },
  async syncSchedules(input) {
    return {
      syncedCount: input.scheduleIds?.length ?? 2,
      events: [
        {
          medicationName: "Amoxicillin 500mg",
          time: "08:00",
          calendarLink: "https://calendar.google.com",
        },
        {
          medicationName: "Paracetamol 650mg",
          time: "20:00",
          calendarLink: "https://calendar.google.com",
        },
      ],
    };
  },
};

export const calendarApi: CalendarApi = IS_DEMO ? demoCalendarApi : liveCalendarApi;
