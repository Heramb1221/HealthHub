import { Router } from "express";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { parse, uuidParam } from "../../lib/validate.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import { createScheduleSchema, doseEventSchema, listSchedulesQuerySchema, updateScheduleSchema } from "./schemas.js";
import { createSchedule, listSchedules, recordDoseEvent, updateSchedule } from "./service.js";

/** Schedules belong to one patient. Providers and admins are refused; the patient is always the session's own. */
export function createScheduleRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));
  router.use(requireRole("patient"));

  router.get("/", async (req, res) => {
    res.json(await listSchedules(db, requireAuth(req), parse(listSchedulesQuerySchema, req.query)));
  });

  router.post("/", async (req, res) => {
    const input = parse(createScheduleSchema, req.body);
    res.status(201).json({ data: await createSchedule(db, requireAuth(req), input, { requestId: req.requestId }) });
  });

  router.patch("/:scheduleId", async (req, res) => {
    const input = parse(updateScheduleSchema, req.body);
    res.json({ data: await updateSchedule(db, requireAuth(req), uuidParam(req.params.scheduleId), input, { requestId: req.requestId }) });
  });

  router.post("/:scheduleId/dose-events", async (req, res) => {
    const input = parse(doseEventSchema, req.body);
    res.status(201).json({ data: await recordDoseEvent(db, requireAuth(req), uuidParam(req.params.scheduleId), input) });
  });

  return router;
}
