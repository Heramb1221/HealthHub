import { Router } from "express";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { parse } from "../../lib/validate.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import { accessHistoryQuerySchema, updateProfileSchema } from "./schemas.js";
import { getHealthCard, getProfile, listAccessHistory, updateProfile } from "./service.js";

/** `/patients/me/*`: the patient is always the authenticated session's own patient. No patient id is ever read from the client. */
export function createPatientRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));
  router.use(requireRole("patient"));

  router.get("/me", async (req, res) => {
    res.json({ data: await getProfile(db, requireAuth(req)) });
  });

  router.patch("/me", async (req, res) => {
    const input = parse(updateProfileSchema, req.body);
    res.json({ data: await updateProfile(db, requireAuth(req), input, { requestId: req.requestId }) });
  });

  router.get("/me/health-card", async (req, res) => {
    res.json({ data: await getHealthCard(db, requireAuth(req)) });
  });

  router.get("/me/access-history", async (req, res) => {
    const query = parse(accessHistoryQuerySchema, req.query);
    res.json(await listAccessHistory(db, requireAuth(req), query));
  });

  return router;
}
