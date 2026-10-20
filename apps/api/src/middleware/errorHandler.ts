import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, errorMessage, errorStatus, type ErrorCode } from "../lib/errors.js";
import { log } from "../lib/logger.js";
import { routeLabel } from "../lib/routeLabel.js";

function send(res: Response, requestId: string, code: ErrorCode, message?: string): void {
  res.status(errorStatus(code)).json({
    error: { code, message: message ?? errorMessage(code), requestId },
  });
}

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

  const type = typeof err === "object" && err !== null ? (err as { type?: unknown }).type : undefined;
  if (type === "entity.parse.failed" || type === "encoding.unsupported" || type === "charset.unsupported") {
    send(res, requestId, "VALIDATION_ERROR");
    return;
  }
  if (type === "entity.too.large") {
    send(res, requestId, "PAYLOAD_TOO_LARGE");
    return;
  }

  log("error", "unhandled error", {
    requestId,
    method: req.method,
    route: routeLabel(req),
    errorName: err instanceof Error ? err.name : "unknown",
  });
  send(res, requestId, "INTERNAL_ERROR");
}
