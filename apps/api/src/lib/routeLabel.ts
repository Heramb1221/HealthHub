import type { Request } from "express";

/**
 * A safe label for logging a request: the route PATTERN (for example
 * `/api/v1/qr/access-sessions/:sessionId`), never the real URL. Real URLs carry
 * record ids, session ids, and query strings, none of which belong in logs.
 * Requests that matched no route are labelled by their router only.
 */
export function routeLabel(req: Request): string {
  const pattern = typeof req.route?.path === "string" ? req.route.path : "";
  const label = `${req.baseUrl}${pattern === "/" ? "" : pattern}`;
  return label.length > 0 ? label : "(unmatched)";
}
