/**
 * Runtime configuration. EXPO_PUBLIC_* values are compiled into the bundle and are public:
 * only the API address lives here, never a secret.
 *
 * There is deliberately no hidden fallback server and no demo/mock mode: if the address is missing
 * (or is plain http in a release build, which would send health data unencrypted) the app says so.
 */
const raw = (process.env.EXPO_PUBLIC_API_URL ?? "").trim();

export const API_CONFIG: { baseUrl: string | null; problem: string | null } = (() => {
  if (!raw) {
    return { baseUrl: null, problem: "No API address is set. Copy .env.example to .env, set EXPO_PUBLIC_API_URL, and restart Expo." };
  }
  if (!/^https?:\/\//i.test(raw)) {
    return { baseUrl: null, problem: "EXPO_PUBLIC_API_URL must start with http:// or https://." };
  }
  if (!__DEV__ && !/^https:\/\//i.test(raw)) {
    return { baseUrl: null, problem: "Release builds require an https:// API address so health data is encrypted in transit." };
  }
  return { baseUrl: raw, problem: null };
})();
