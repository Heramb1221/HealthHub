import { DEMO_BASE_URL } from "./demo/demoFetch";

/**
 * Runtime configuration. EXPO_PUBLIC_* values are compiled into the bundle and are public:
 * only the API address and mode live here, never a secret.
 *
 * - No EXPO_PUBLIC_API_URL (or EXPO_PUBLIC_API_MODE=demo): DEMO mode. An in-memory synthetic API runs inside the app,
 *   a persistent "Demo mode" bar is shown, nothing is sent anywhere or saved, and sign-in is not a real account.
 * - EXPO_PUBLIC_API_URL set: LIVE mode against the real server. If the address is invalid (or plain http in a release
 *   build, which would send health data unencrypted) the app says so instead of guessing.
 */
export type ApiMode = "demo" | "live";

const raw = (process.env.EXPO_PUBLIC_API_URL ?? "").trim();
const forceDemo = (process.env.EXPO_PUBLIC_API_MODE ?? "").trim().toLowerCase() === "demo";

export const API_CONFIG: { mode: ApiMode; baseUrl: string | null; problem: string | null } = (() => {
  if (forceDemo || !raw) return { mode: "demo", baseUrl: DEMO_BASE_URL, problem: null };
  if (!/^https?:\/\//i.test(raw)) return { mode: "live", baseUrl: null, problem: "EXPO_PUBLIC_API_URL must start with http:// or https://." };
  if (!__DEV__ && !/^https:\/\//i.test(raw)) {
    return { mode: "live", baseUrl: null, problem: "Release builds require an https:// API address so health data is encrypted in transit." };
  }
  return { mode: "live", baseUrl: raw, problem: null };
})();

export const IS_DEMO = API_CONFIG.mode === "demo";
