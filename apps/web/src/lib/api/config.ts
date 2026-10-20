
export type ApiMode = "live" | "demo";

export const API_MODE: ApiMode = process.env.NEXT_PUBLIC_API_MODE === "live" ? "live" : "demo";

export const IS_DEMO = API_MODE === "demo";

export const API_BASE_PATH = "/api/v1";

export const SESSION_COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? "hh_session";
