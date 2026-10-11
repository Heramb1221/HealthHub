/**
 * Error envelope from docs/API_CONTRACT.md and apps/api/docs/CONTRACT_DECISIONS.md (A1, A2):
 * { "error": { "code", "message", "requestId" } }
 */
export type ClientErrorCode = "NETWORK_ERROR" | "TIMEOUT" | "INVALID_RESPONSE" | "NOT_CONFIGURED";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(params: { code: string; message: string; status: number; requestId?: string }) {
    super(params.message);
    this.name = "ApiError";
    this.code = params.code;
    this.status = params.status;
    this.requestId = params.requestId;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isNetwork(): boolean {
    return this.code === "NETWORK_ERROR" || this.code === "TIMEOUT";
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

function isErrorBody(value: unknown): value is { error: { code: string; message: string; requestId?: string } } {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const err = (value as { error: unknown }).error;
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { code?: unknown }).code === "string" &&
    typeof (err as { message?: unknown }).message === "string"
  );
}

export function apiErrorFromResponse(status: number, body: unknown): ApiError {
  if (isErrorBody(body)) {
    return new ApiError({
      code: body.error.code,
      message: body.error.message,
      status,
      requestId: body.error.requestId,
    });
  }
  return new ApiError({
    code: status === 401 ? "UNAUTHENTICATED" : "INVALID_RESPONSE",
    message: status === 401 ? "Your session has ended." : "The server returned an unexpected response.",
    status,
  });
}

export interface ErrorDescription {
  title: string;
  detail: string;
  requestId?: string;
  /** True when retrying the same action may succeed (network, rate limit, server fault). */
  retryable: boolean;
}

/** Plain-language, safe-to-show message. Never includes server internals or submitted values. */
export function describeError(error: unknown): ErrorDescription {
  if (!isApiError(error)) {
    return { title: "Something went wrong", detail: "An unexpected error occurred. Try again.", retryable: true };
  }
  const withId = error.requestId ? { requestId: error.requestId } : {};
  switch (error.code) {
    case "NOT_CONFIGURED":
      return { title: "App not configured", detail: error.message, retryable: false };
    case "NETWORK_ERROR":
      return { title: "Can't reach HealthHub", detail: "Check your internet connection and try again.", retryable: true };
    case "TIMEOUT":
      return { title: "This is taking too long", detail: "The server did not respond in time. Try again.", retryable: true };
    case "RATE_LIMITED":
      return { title: "Too many attempts", detail: "Wait a moment, then try again.", retryable: true, ...withId };
    case "PAYLOAD_TOO_LARGE":
      return { title: "File too large", detail: "Choose a smaller file or a lower-resolution photo.", retryable: false, ...withId };
    case "UNSUPPORTED_MEDIA_TYPE":
      return { title: "File type not supported", detail: "Choose a photo (JPEG or PNG) or a PDF.", retryable: false, ...withId };
    case "PROVIDER_DISABLED":
      return {
        title: "Automatic reading is turned off",
        detail: "This server has prescription reading disabled. You can still enter the details yourself.",
        retryable: false,
        ...withId,
      };
    case "CONFLICT":
      return { title: "That is no longer possible", detail: error.message, retryable: false, ...withId };
    default:
  }
  if (error.isUnauthenticated) {
    return { title: "You're signed out", detail: "Sign in again to continue.", retryable: false };
  }
  if (error.isForbidden) {
    return { title: "No access", detail: "Your account isn't permitted to view or change this.", retryable: false, ...withId };
  }
  if (error.isNotFound) {
    return { title: "Not found", detail: "This item doesn't exist or isn't available to you.", retryable: false, ...withId };
  }
  if (error.status >= 500) {
    return { title: "HealthHub had a problem", detail: "Try again in a moment.", retryable: true, ...withId };
  }
  return { title: "Request not accepted", detail: error.message, retryable: false, ...withId };
}
