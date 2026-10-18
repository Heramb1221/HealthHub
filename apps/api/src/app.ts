import cors from "cors";
import express, { Router, type Express } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import type { Env } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { log } from "./lib/logger.js";
import { routeLabel } from "./lib/routeLabel.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import { requestId } from "./middleware/requestId.js";
import type { Db } from "./db/client.js";
import { createAuthRouter } from "./modules/auth/routes.js";
import { createConsentRouter } from "./modules/consents/routes.js";
import { createAppointmentRouter } from "./modules/appointments/routes.js";
import { createHistoryRouter } from "./modules/history/routes.js";
import { createAdminHospitalRouter, createHospitalRouter } from "./modules/hospitals/routes.js";
import { createPatientRouter } from "./modules/patients/routes.js";
import { createQrRouter } from "./modules/qr/routes.js";
import { createScheduleRouter } from "./modules/schedules/routes.js";
import { createPrescriptionRouter } from "./modules/prescriptions/routes.js";
import { createVaccinationRouter } from "./modules/vaccinations/routes.js";
import { createFamilyRouter } from "./modules/family/routes.js";
import { createNotificationRouter } from "./modules/notifications/routes.js";
import { createSymptomRouter } from "./modules/symptoms/routes.js";
import { createInsuranceRouter } from "./modules/insurance/routes.js";
import { createPaymentRouter } from "./modules/payments/routes.js";
import { createDashboardRouter } from "./modules/dashboard/routes.js";
import type { ExtractionProvider } from "./extraction/types.js";
import type { PrivateFileStore } from "./storage/types.js";
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
  /** Database access; when omitted only the health route is mounted. */
  db?: Db;
  /** Private file storage; prescription routes are mounted only when both db and store are given. */
  store?: PrivateFileStore;
  /** Extraction provider; null or omitted means extraction is disabled. */
  extraction?: ExtractionProvider | null;
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
        route: routeLabel(req),
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
  if (deps.db) {
    api.use("/auth", createAuthRouter(deps.db, env));
    api.use("/consents", createConsentRouter(deps.db, env));
    api.use("/patients", createPatientRouter(deps.db, env));
    api.use("/qr/access-sessions", createQrRouter(deps.db, env));
    api.use("/medication-schedules", createScheduleRouter(deps.db, env));
    api.use("/hospitals", createHospitalRouter(deps.db, env));
    api.use("/admin/hospitals", createAdminHospitalRouter(deps.db, env));
    api.use("/appointments", createAppointmentRouter(deps.db, env));
    api.use("/health-history", createHistoryRouter(deps.db, env));
    api.use("/vaccinations", createVaccinationRouter(deps.db, env));
    api.use("/family-members", createFamilyRouter(deps.db, env));
    api.use("/notifications", createNotificationRouter(deps.db, env));
    api.use("/symptoms", createSymptomRouter(deps.db, env));
    api.use("/insurance", createInsuranceRouter(deps.db, env));
    api.use("/payments", createPaymentRouter(deps.db, env));
    api.use("/dashboard", createDashboardRouter(deps.db, env));
    if (deps.store) api.use("/prescriptions", createPrescriptionRouter(deps.db, env, deps.store, deps.extraction ?? null));
  }
  register?.(api);
  app.use(API_PREFIX, api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
