import { ApiError, apiErrorFromResponse } from "./errors.ts";

export interface HttpConfig {

  baseUrl: string | null;
  getToken: () => string | null;

  onUnauthorized: () => void;

  fetchImpl?: typeof fetch;
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
    body = formData;
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
      response = await (config.fetchImpl ?? fetch)(url, { method, headers, body, signal: controller.signal });
    } catch (cause) {
      if (signal?.aborted) throw cause;
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

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { parsed } = await send(path, options);
  if (parsed === undefined) return undefined as T;
  return unwrapEnvelope<T>(parsed);
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

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
