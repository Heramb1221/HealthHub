import { API_BASE_PATH, SESSION_COOKIE_NAME } from "./config";
import { ApiError, apiErrorFromResponse } from "./errors";

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Query;

  json?: unknown;

  formData?: FormData;
  signal?: AbortSignal;
}

declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: () => Promise<string | null>;
      };
    };
  }
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  const local = localStorage.getItem("hh_token");
  if (local) return local;
  const match = document.cookie.match(/(?:^|;\s*)(?:__session|hh_session)=([^;]+)/);
  if (match) return decodeURIComponent(match[1]);
  return null;
}

export async function resolveAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (window.Clerk?.session?.getToken) {
    try {
      const fresh = await window.Clerk.session.getToken();
      if (fresh) {
        localStorage.setItem("hh_token", fresh);
        return fresh;
      }
    } catch {

    }
  }
  return getAuthToken();
}

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem("hh_token", token);
    document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; path=/; SameSite=Lax; max-age=86400`;
  } else {
    localStorage.removeItem("hh_token");
    document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0`;
  }
}

function buildUrl(path: string, query?: Query) {
  const url = `${API_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export function unwrapEnvelope<T>(body: unknown): T {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    if ("data" in body) {
      const keys = Object.keys(body);
      if (keys.length === 1 || (keys.length === 2 && "page" in body)) {
        return (body as { data: T }).data;
      }
    }
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

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, json, formData, signal } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;

  const token = await resolveAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (formData) {
    body = formData;
  } else if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), { method, headers, body, signal, credentials: "include", cache: "no-store" });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError({ code: "NETWORK_ERROR", message: "The server could not be reached.", status: 0 });
  }

  const parsed = await parseBody(response);
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined" && !window.Clerk?.session) {
      setAuthToken(null);
    }
    throw apiErrorFromResponse(response.status, parsed);
  }
  if (parsed === undefined) return undefined as T;
  return unwrapEnvelope<T>(parsed);
}

export async function requestBlob(path: string, signal?: AbortSignal): Promise<{ blob: Blob; filename?: string }> {
  let response: Response;
  const headers: Record<string, string> = {};
  const token = await resolveAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  try {
    response = await fetch(buildUrl(path), { method: "GET", headers, credentials: "include", cache: "no-store", signal });
  } catch {
    throw new ApiError({ code: "NETWORK_ERROR", message: "The server could not be reached.", status: 0 });
  }
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined" && !window.Clerk?.session) setAuthToken(null);
    throw apiErrorFromResponse(response.status, await parseBody(response));
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return { blob: await response.blob(), filename: match?.[1] };
}

export function asList<T>(body: T[] | { items: T[] } | { data: T[] } | null | undefined): T[] {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  if (typeof body === "object") {
    if ("data" in body && Array.isArray((body as { data: unknown }).data)) {
      return (body as { data: T[] }).data;
    }
    if ("items" in body && Array.isArray((body as { items: unknown }).items)) {
      return (body as { items: T[] }).items;
    }
  }
  return [];
}
