import { demoHealthCardApi } from "@/lib/demo/health-card";

import { request } from "./http";
import { pick } from "./mode";
import type { HealthCard } from "./types";

export interface HealthCardApi {
  get(): Promise<HealthCard>;
}

const liveHealthCardApi: HealthCardApi = {
  get: () => request<HealthCard>("/patients/me/health-card"),
};

export const healthCardApi: HealthCardApi = pick(liveHealthCardApi, demoHealthCardApi);
