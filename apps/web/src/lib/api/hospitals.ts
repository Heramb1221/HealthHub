
import { asList, request } from "./http";
import type { AvailabilitySlot, Hospital, HospitalReview, HospitalReviewsResult } from "./types";

export interface HospitalsApi {
  /** Hospitals a patient can book with, A to Z. */
  list(): Promise<Hospital[]>;
  get(id: string): Promise<Hospital>;
  /**
   * Every hospital including deactivated ones. For the admin portal only: the server must return the full list
   * to administrators and must refuse or filter it for everyone else.
   */
  listAll(): Promise<Hospital[]>;
  /** Open, future slots for one hospital, earliest first. The server decides what is open. */
  availability(hospitalId: string): Promise<AvailabilitySlot[]>;
  holdSlot(hospitalId: string, slotId: string): Promise<{ held: boolean; expiresAt: string; secondsRemaining: number }>;
  releaseSlot(hospitalId: string, slotId: string): Promise<{ released: boolean }>;
  reviews(hospitalId: string): Promise<HospitalReviewsResult>;
  submitReview(hospitalId: string, input: { rating: number; reviewText?: string }): Promise<HospitalReview>;
}

function normalizeHospital(h: Hospital & { active?: boolean; isActive?: boolean }): Hospital {
  const active = Boolean(h.active ?? h.isActive ?? true);
  return {
    ...h,
    active,
    isActive: active,
  };
}

const path = (id: string) => `/hospitals/${encodeURIComponent(id)}`;

const liveHospitalsApi: HospitalsApi = {
  async list() {
    const raw = asList(await request<Hospital[] | { items: Hospital[] }>("/hospitals"));
    const items = raw.map(normalizeHospital);
    // Never offer a deactivated hospital for booking, even if the server returned it.
    return items.filter((h) => h.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  },
  async get(id) {
    const raw = await request<Hospital | { data: Hospital }>(path(id));
    const data = raw && typeof raw === "object" && "data" in raw ? (raw as { data: Hospital }).data : raw;
    return normalizeHospital(data as Hospital);
  },
  async listAll() {
    const raw = asList(await request<Hospital[] | { items: Hospital[] }>("/hospitals"));
    return raw.map(normalizeHospital).sort((a, b) => a.name.localeCompare(b.name));
  },
  async availability(hospitalId) {
    const raw = await request<AvailabilitySlot[] | { data: AvailabilitySlot[] }>(`${path(hospitalId)}/availability?limit=200`);
    const items = asList(raw);
    return items.map((s) => ({
      ...s,
      hospitalId,
    })).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },
  async holdSlot(hospitalId, slotId) {
    return request<{ held: boolean; expiresAt: string; secondsRemaining: number }>(
      `${path(hospitalId)}/slots/${encodeURIComponent(slotId)}/hold`,
      { method: "POST" },
    );
  },
  async releaseSlot(hospitalId, slotId) {
    return request<{ released: boolean }>(
      `${path(hospitalId)}/slots/${encodeURIComponent(slotId)}/release`,
      { method: "POST" },
    );
  },
  async reviews(hospitalId) {
    const raw = await request<HospitalReviewsResult | { data: HospitalReviewsResult }>(`${path(hospitalId)}/reviews`);
    return raw && typeof raw === "object" && "data" in raw ? (raw as { data: HospitalReviewsResult }).data : (raw as HospitalReviewsResult);
  },
  async submitReview(hospitalId, input) {
    const raw = await request<HospitalReview | { data: HospitalReview }>(`${path(hospitalId)}/reviews`, {
      method: "POST",
      json: input,
    });
    return raw && typeof raw === "object" && "data" in raw ? (raw as { data: HospitalReview }).data : (raw as HospitalReview);
  },
};

export const hospitalsApi: HospitalsApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? liveHospitalsApi
    : // Required only in demo builds, so demo accounts and sample data never ship in a live bundle (see README).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/hospitals") as typeof import("@/lib/demo/hospitals")).demoHospitalsApi;
