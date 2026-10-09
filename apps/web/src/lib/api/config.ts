/**
 * Runtime configuration for the API layer.
 *
 * NEXT_PUBLIC_API_MODE=live  -> call the Express API at /api/v1 (proxied by next.config.ts)
 * NEXT_PUBLIC_API_MODE=demo  -> use the typed demo adapters in src/lib/demo (clearly labelled in the UI)
 *
 * Demo is the default so a fresh clone renders without a backend. The UI always
 * shows a persistent demo banner while demo mode is active.
 */
export type ApiMode = "live" | "demo";

export const API_MODE: ApiMode = process.env.NEXT_PUBLIC_API_MODE === "live" ? "live" : "demo";

export const IS_DEMO = API_MODE === "demo";

/** Same-origin path; next.config.ts rewrites it to API_ORIGIN so session cookies stay first-party. */
export const API_BASE_PATH = "/api/v1";

/** Name of the httpOnly session cookie, used only for optimistic redirects in proxy.ts. */
export const SESSION_COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? "hh_session";
