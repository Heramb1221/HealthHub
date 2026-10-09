import { API_BASE_PATH } from "./config";
import { ApiError, apiErrorFromResponse } from "./errors";

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Query;
  /** JSON body. Mutually exclusive with `formData`. */
  json?: unknown;
  /** Multipart body, e.g. prescription upload. Content-Type is set by the browser. */
  formData?: FormData;
  signal?: AbortSignal;
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

/**
 * The contract allows success responses to be either the bare resource or `{ data: resource }`
 * ("consistently across the project"). Unwrap the envelope only when it is the sole key so a
 * resource that legitimately has a `data` field is not mangled.
 */
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

/** Typed JSON request. Sends the httpOnly session cookie; never reads or stores tokens in JS. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, json, formData, signal } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;

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
  if (!response.ok) throw apiErrorFromResponse(response.status, parsed);
  if (parsed === undefined) return undefined as T;
  return unwrapEnvelope<T>(parsed);
}

/** Binary download (e.g. prescription PDF). Returns the blob and a suggested filename if provided. */
export async function requestBlob(path: string, signal?: AbortSignal): Promise<{ blob: Blob; filename?: string }> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path), { method: "GET", credentials: "include", cache: "no-store", signal });
  } catch {
    throw new ApiError({ code: "NETWORK_ERROR", message: "The server could not be reached.", status: 0 });
  }
  if (!response.ok) throw apiErrorFromResponse(response.status, await parseBody(response));
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return { blob: await response.blob(), filename: match?.[1] };
}
