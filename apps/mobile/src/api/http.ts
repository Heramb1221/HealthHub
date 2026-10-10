import { ApiError, apiErrorFromResponse } from "./errors.ts";

/**
 * Low-level typed HTTP client. No React Native imports so it can be unit-tested in Node.
 *
 * Auth: access token sent as `Authorization: Bearer <token>` (backend note B1: JWT in the response body,
 * no cookies, no refresh). The token is supplied through `getToken`; this module never stores it.
 */
export interface HttpConfig {
  /** Absolute base URL including the `/api/v1` prefix, or null when the app is not configured. */
  baseUrl: string | null;
  getToken: () => string | null;
  /** Called once when an authenticated request is rejected with 401. */
  onUnauthorized: () => void;
}

let config: HttpConfig = { baseUrl: null, getToken: () => null, onUnauthorized: () => {} };

export function configureHttp(next: HttpConfig): void {
  config = { ...next, baseUrl: next.baseUrl ? next.baseUrl.replace(/\/+$/, "") : null };
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Query;
  json?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Skip the global 401 handler (used by sign-in/register, where 401 means "wrong credentials"). */
  skipUnauthorizedHandler?: boolean;
}

export function apiUrl(path: string, query?: Query): string {
  if (!config.baseUrl) {
    throw new ApiError({
      code: "NOT_CONFIGURED",
      message: "No API address is configured. Set EXPO_PUBLIC_API_URL and restart the app.",
      status: 0,
    });
  }
  const url = `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export function authHeaders(): Record<string, string> {
  const token = config.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Backend note A1: success is `{ data: ... }`. Also tolerate a bare resource, as the contract allows either. */
export function unwrapEnvelope<T>(body: unknown): T {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const keys = Object.keys(body);
    if (keys.length === 1 && keys[0] === "data") return (body as { data: T }).data;
  }
  return body as T;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

interface RawResult {
  parsed: unknown;
  status: number;
}

async function send(path: string, options: RequestOptions): Promise<RawResult> {
  const { method = "GET", query, json, formData, signal, timeoutMs = 20_000, skipUnauthorizedHandler } = options;
  const url = apiUrl(path, query);
  const headers: Record<string, string> = { Accept: "application/json", ...authHeaders() };
  const sentToken = "Authorization" in headers;

  let body: FormData | string | undefined;
  if (formData) {
    body = formData; // Content-Type with boundary is set by the platform.
  } else if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort);

  try {
    let response: Response;
    try {
      response = await fetch(url, { method, headers, body, signal: controller.signal });
    } catch (cause) {
      if (signal?.aborted) throw cause; // caller cancelled; let it propagate untouched
      if (timedOut) throw new ApiError({ code: "TIMEOUT", message: "The server did not respond in time.", status: 0 });
      throw new ApiError({ code: "NETWORK_ERROR", message: "The server could not be reached.", status: 0 });
    }
    const parsed = await parseBody(response);
    if (!response.ok) {
      if (response.status === 401 && sentToken && !skipUnauthorizedHandler) config.onUnauthorized();
      throw apiErrorFromResponse(response.status, parsed);
    }
    return { parsed, status: response.status };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

/** Typed JSON request returning the unwrapped resource. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { parsed } = await send(path, options);
  if (parsed === undefined) return undefined as T;
  return unwrapEnvelope<T>(parsed);
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Backend note B2 (proposed): `{ data: [...], page: { limit, nextCursor } }`. Also accepts a bare array. */
export async function requestList<T>(path: string, options: RequestOptions = {}): Promise<Page<T>> {
  const { parsed } = await send(path, options);
  if (Array.isArray(parsed)) return { items: parsed as T[], nextCursor: null };
  if (typeof parsed === "object" && parsed !== null) {
    const record = parsed as { data?: unknown; items?: unknown; page?: { nextCursor?: unknown } };
    const list = Array.isArray(record.data) ? record.data : Array.isArray(record.items) ? record.items : null;
    if (list) {
      const next = record.page?.nextCursor;
      return { items: list as T[], nextCursor: typeof next === "string" ? next : null };
    }
  }
  throw new ApiError({ code: "INVALID_RESPONSE", message: "The server returned an unexpected response.", status: 200 });
}
