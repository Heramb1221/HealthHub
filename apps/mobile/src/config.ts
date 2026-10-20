import { DEMO_BASE_URL } from "./demo/demoFetch";

export type ApiMode = "demo" | "live";

const raw = (process.env.EXPO_PUBLIC_API_URL ?? "").trim();

const appMode = (process.env.EXPO_PUBLIC_APP_MODE ?? "").trim().toLowerCase();
const forceDemo = appMode === "demo" || (process.env.EXPO_PUBLIC_API_MODE ?? "").trim().toLowerCase() === "demo";
const wantsLive = appMode === "live";

export const API_CONFIG: { mode: ApiMode; baseUrl: string | null; problem: string | null } = (() => {
  if (forceDemo || (!raw && !wantsLive)) return { mode: "demo", baseUrl: DEMO_BASE_URL, problem: null };
  if (!raw) return { mode: "live", baseUrl: null, problem: "EXPO_PUBLIC_APP_MODE=live needs EXPO_PUBLIC_API_URL, for example http://localhost:4000/api/v1." };
  if (!/^https?:\/\//i.test(raw)) return { mode: "live", baseUrl: null, problem: "EXPO_PUBLIC_API_URL must start with http:// or https://." };
  if (!__DEV__ && !/^https:\/\//i.test(raw)) {
    return { mode: "live", baseUrl: null, problem: "Release builds require an https:// API address so health data is encrypted in transit." };
  }
  return { mode: "live", baseUrl: raw, problem: null };
})();

export const IS_DEMO = API_CONFIG.mode === "demo";
