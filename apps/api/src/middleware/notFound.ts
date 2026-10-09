import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors.js";

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError("NOT_FOUND"));
}
