import { Router } from "express";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { parse, uuidParam } from "../../lib/validate.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import { bookAppointmentSchema, listAppointmentsQuerySchema } from "./schemas.js";
import { bookAppointment, cancelAppointment, listAppointments } from "./service.js";
import { notifyAppointmentEvent } from "../notifications/service.js";

export function createAppointmentRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));
  router.use(requireRole("patient"));
  router.post("/", async (req, res) => {
    const { slotId } = parse(bookAppointmentSchema, req.body);
    const appointment = await bookAppointment(db, requireAuth(req), slotId, { requestId: req.requestId });

    notifyAppointmentEvent(db, env, appointment.id, "booked");
    res.status(201).json({ data: appointment });
  });
  router.get("/", async (req, res) => {
    res.json(await listAppointments(db, requireAuth(req), parse(listAppointmentsQuerySchema, req.query)));
  });
  router.post("/:appointmentId/cancel", async (req, res) => {
    const appointment = await cancelAppointment(db, requireAuth(req), uuidParam(req.params.appointmentId), { requestId: req.requestId });

    notifyAppointmentEvent(db, env, appointment.id, "cancelled");
    res.json({ data: appointment });
  });
  return router;
}
