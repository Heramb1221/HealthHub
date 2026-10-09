import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, errorMessage, errorStatus, type ErrorCode } from "../lib/errors.js";
import { log } from "../lib/logger.js";

function send(res: Response, requestId: string, code: ErrorCode, message?: string): void {
  res.status(errorStatus(code)).json({
    error: { code, message: message ?? errorMessage(code), requestId },
  });
}

// Express requires the four-argument signature to treat this as an error handler.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;
  const requestId = req.requestId;

  if (err instanceof AppError) {
    send(res, requestId, err.code, err.message);
    return;
  }
  if (err instanceof ZodError) {
    send(res, requestId, "VALIDATION_ERROR");
    return;
  }

  // body-parser errors carry a `type` and an HTTP status we can map safely.
  const type = typeof err === "object" && err !== null ? (err as { type?: unknown }).type : undefined;
  if (type === "entity.parse.failed" || type === "encoding.unsupported" || type === "charset.unsupported") {
    send(res, requestId, "VALIDATION_ERROR");
    return;
  }
  if (type === "entity.too.large") {
    send(res, requestId, "PAYLOAD_TOO_LARGE");
    return;
  }

  // Unknown failure: log only the error name and request metadata, never the message or stack.
  log("error", "unhandled error", {
    requestId,
    method: req.method,
    path: req.originalUrl.split("?")[0] ?? "",
    errorName: err instanceof Error ? err.name : "unknown",
  });
  send(res, requestId, "INTERNAL_ERROR");
}
