import cors from "cors";
import express, { Router, type Express } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import type { Env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { log } from "./lib/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { requestId } from "./middleware/requestId.js";
import { createHealthRouter } from "./routes/health.js";

export const API_PREFIX = "/api/v1";

/**
 * Builds the Express app. `register` lets later modules (and tests) mount
 * routers under the API prefix; they are mounted after the rate limiter and
 * before the 404 and error handlers.
 */
export interface AppDeps {
  /** Reports whether the database is reachable; omitted in tests that do not need it. */
  checkDatabase?: () => Promise<boolean>;
}

export function createApp(env: Env, register?: (router: Router) => void, deps: AppDeps = {}): Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Requests without an Origin header (curl, mobile apps) are not browser cross-origin calls.
        callback(null, origin === undefined || env.CORS_ORIGINS.includes(origin));
      },
    }),
  );

  app.use((req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      log("info", "request", {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl.split("?")[0] ?? "",
        status: res.statusCode,
        ms: Date.now() - started,
      });
    });
    next();
  });

  app.use(express.json({ limit: "100kb" }));

  const api = Router();
  api.use(createHealthRouter(deps.checkDatabase));
  api.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler: (_req, _res, next) => next(new AppError("RATE_LIMITED")),
    }),
  );
  register?.(api);
  app.use(API_PREFIX, api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
