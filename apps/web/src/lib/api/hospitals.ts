import { demoHospitalsApi } from "@/lib/demo/hospitals";

import { asList, request } from "./http";
import { pick } from "./mode";
import type { AvailabilitySlot, Hospital } from "./types";

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
}

const path = (id: string) => `/hospitals/${encodeURIComponent(id)}`;

const liveHospitalsApi: HospitalsApi = {
  async list() {
    const items = asList(await request<Hospital[] | { items: Hospital[] }>("/hospitals"));
    // Never offer a deactivated hospital for booking, even if the server returned it.
    return items.filter((h) => h.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  },
  get: (id) => request<Hospital>(path(id)),
  async listAll() {
    const items = asList(await request<Hospital[] | { items: Hospital[] }>("/hospitals"));
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  },
  async availability(hospitalId) {
    const items = asList(await request<AvailabilitySlot[] | { items: AvailabilitySlot[] }>(`${path(hospitalId)}/availability`));
    return [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },
};

export const hospitalsApi: HospitalsApi = pick(liveHospitalsApi, demoHospitalsApi);
