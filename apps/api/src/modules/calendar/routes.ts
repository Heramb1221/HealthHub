import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import { parse } from "../../lib/validate.js";
import {
  disconnectGoogleCalendar,
  getCalendarStatus,
  getGoogleOAuthUrl,
  handleGoogleOAuthCallback,
  syncMedicationSchedules,
} from "./service.js";

const syncSchema = z.object({
  scheduleIds: z.array(z.string().uuid()).optional(),
  prescriptionId: z.string().uuid().optional(),
});

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export function calendarRouter(db: Db, env: Env): Router {
  const router = Router();

  // Status check
  router.get("/status", authenticate(db, env), requireRole("patient"), async (req, res, next) => {
    try {
      const status = await getCalendarStatus(db, requireAuth(req), env);
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  // Get OAuth Authorization URL
  router.get("/google/auth-url", authenticate(db, env), requireRole("patient"), async (req, res, next) => {
    try {
      const origin = (req.headers.origin as string) || (req.headers.referer as string);
      const url = getGoogleOAuthUrl(env, requireAuth(req).userId, origin);
      res.json({ url });
    } catch (err) {
      next(err);
    }
  });

  // OAuth redirect callback (public browser redirect from Google)
  router.get("/google/callback", async (req, res, next) => {
    try {
      const query = parse(callbackQuerySchema, req.query);
      const result = await handleGoogleOAuthCallback(db, env, query.code, query.state);
      res.redirect(result.redirectUrl);
    } catch (err) {
      next(err);
    }
  });

  // Disconnect Google Calendar
  router.post("/google/disconnect", authenticate(db, env), requireRole("patient"), async (req, res, next) => {
    try {
      await disconnectGoogleCalendar(db, requireAuth(req));
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // Sync medication schedules into Google Calendar
  router.post("/sync-schedules", authenticate(db, env), requireRole("patient"), async (req, res, next) => {
    try {
      const body = parse(syncSchema, req.body);
      const result = await syncMedicationSchedules(db, requireAuth(req), env, body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
