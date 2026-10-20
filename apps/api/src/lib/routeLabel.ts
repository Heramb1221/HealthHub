import type { Request } from "express";

export function routeLabel(req: Request): string {
  const pattern = typeof req.route?.path === "string" ? req.route.path : "";
  const label = `${req.baseUrl}${pattern === "/" ? "" : pattern}`;
  return label.length > 0 ? label : "(unmatched)";
}
