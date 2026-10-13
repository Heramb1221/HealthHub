export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "RATE_LIMITED"
  | "PROVIDER_DISABLED"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  PROVIDER_DISABLED: 503,
  INTERNAL_ERROR: 500,
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Request could not be validated",
  UNAUTHENTICATED: "Authentication is required",
  FORBIDDEN: "You do not have permission to perform this action",
  NOT_FOUND: "Resource not found",
  CONFLICT: "Request conflicts with the current state",
  PAYLOAD_TOO_LARGE: "Request payload is too large",
  UNSUPPORTED_MEDIA_TYPE: "Unsupported media type",
  RATE_LIMITED: "Too many requests",
  PROVIDER_DISABLED: "This capability is disabled by configuration",
  INTERNAL_ERROR: "An unexpected error occurred",
};

/** Error whose code and message are safe to return to clients. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    public readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? DEFAULT_MESSAGE[code]);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

export function errorStatus(code: ErrorCode): number {
  return STATUS[code];
}

export function errorMessage(code: ErrorCode): string {
  return DEFAULT_MESSAGE[code];
}
