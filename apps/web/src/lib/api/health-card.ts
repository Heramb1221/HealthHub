
import { request } from "./http";
import type { HealthCard } from "./types";

export interface HealthCardApi {
  get(): Promise<HealthCard>;
}

const liveHealthCardApi: HealthCardApi = {
  get: () => request<HealthCard>("/patients/me/health-card"),
};

export const healthCardApi: HealthCardApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? liveHealthCardApi
    : // Required only in demo builds, so demo accounts and sample data never ship in a live bundle (see README).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/health-card") as typeof import("@/lib/demo/health-card")).demoHealthCardApi;
