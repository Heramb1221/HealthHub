import { Router } from "express";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { parse, uuidParam } from "../../lib/validate.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import { z } from "zod";
import { availabilityQuerySchema, createHospitalSchema, listHospitalsQuerySchema, updateHospitalSchema } from "./schemas.js";
import {
  addAvailabilitySlots,
  createHospital,
  createHospitalReview,
  deactivateHospital,
  getHospital,
  listAvailability,
  listHospitalReviews,
  listHospitals,
  updateHospital,
} from "./service.js";

const reviewSchema = z.strictObject({
  rating: z.coerce.number().int().min(1).max(5),
  reviewText: z.string().max(500).optional(),
});

const adminSlotsSchema = z.strictObject({
  slots: z.array(z.strictObject({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })).min(1).max(50),
});

/** The hospital directory: any signed-in user may read it. */
export function createHospitalRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));
  router.get("/", async (req, res) => {
    res.json(await listHospitals(db, requireAuth(req), parse(listHospitalsQuerySchema, req.query)));
  });
  router.get("/:hospitalId", async (req, res) => {
    res.json({ data: await getHospital(db, requireAuth(req), uuidParam(req.params.hospitalId)) });
  });
  router.get("/:hospitalId/availability", async (req, res) => {
    res.json(await listAvailability(db, requireAuth(req), uuidParam(req.params.hospitalId), parse(availabilityQuerySchema, req.query)));
  });
  router.get("/:hospitalId/reviews", async (req, res) => {
    res.json({ data: await listHospitalReviews(db, uuidParam(req.params.hospitalId)) });
  });
  router.post("/:hospitalId/reviews", requireRole("patient"), async (req, res) => {
    const input = parse(reviewSchema, req.body);
    const review = await createHospitalReview(db, requireAuth(req), uuidParam(req.params.hospitalId), input, { requestId: req.requestId });
    res.status(201).json({ data: review });
  });
  return router;
}

/** Directory management: admins only. An admin role never grants access to medical records. */
export function createAdminHospitalRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));
  router.use(requireRole("admin"));
  router.post("/", async (req, res) => {
    res.status(201).json({ data: await createHospital(db, requireAuth(req), parse(createHospitalSchema, req.body), { requestId: req.requestId }) });
  });
  router.patch("/:hospitalId", async (req, res) => {
    res.json({ data: await updateHospital(db, requireAuth(req), uuidParam(req.params.hospitalId), parse(updateHospitalSchema, req.body), { requestId: req.requestId }) });
  });
  router.post("/:hospitalId/deactivate", async (req, res) => {
    res.json({ data: await deactivateHospital(db, requireAuth(req), uuidParam(req.params.hospitalId), { requestId: req.requestId }) });
  });
  router.post("/:hospitalId/slots", async (req, res) => {
    const { slots } = parse(adminSlotsSchema, req.body);
    const result = await addAvailabilitySlots(db, requireAuth(req), uuidParam(req.params.hospitalId), slots, { requestId: req.requestId });
    res.status(201).json({ data: result });
  });
  return router;
}
