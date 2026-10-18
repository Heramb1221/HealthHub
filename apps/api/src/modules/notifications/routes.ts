import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { parse } from "../../lib/validate.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import {
  getNotificationPreferences,
  sendTestNotification,
  updateNotificationPreferences,
} from "./service.js";

const updatePreferencesSchema = z.strictObject({
  emailEnabled: z.boolean().optional(),
  appointmentsEnabled: z.boolean().optional(),
  prescriptionsEnabled: z.boolean().optional(),
  medicationsEnabled: z.boolean().optional(),
  securityAlertsEnabled: z.boolean().optional(),
});

export function createNotificationRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));
  router.use(requireRole("patient"));

  router.get("/preferences", async (req, res) => {
    const data = await getNotificationPreferences(db, requireAuth(req));
    res.json({ data });
  });

  router.patch("/preferences", async (req, res) => {
    const input = parse(updatePreferencesSchema, req.body);
    const data = await updateNotificationPreferences(db, requireAuth(req), input);
    res.json({ data });
  });

  router.post("/test", async (req, res) => {
    const result = await sendTestNotification(db, env, requireAuth(req));
    res.json({ data: result });
  });

  return router;
}
