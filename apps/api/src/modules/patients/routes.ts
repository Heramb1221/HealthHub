import { Router } from "express";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { parse } from "../../lib/validate.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import { accessHistoryQuerySchema, updateProfileSchema } from "./schemas.js";
import { z } from "zod";
import {
  acceptTerms,
  deactivateAccount,
  exportPatientData,
  getHealthCard,
  getProfile,
  getTermsStatus,
  listAccessHistory,
  updateProfile,
} from "./service.js";

const acceptTermsSchema = z.strictObject({
  version: z.string().min(1).max(50),
});

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

  router.post("/me/export", async (req, res) => {
    res.json({ data: await exportPatientData(db, requireAuth(req), { requestId: req.requestId }) });
  });

  router.post("/me/deactivate", async (req, res) => {
    res.json({ data: await deactivateAccount(db, requireAuth(req), { requestId: req.requestId }) });
  });

  router.get("/me/terms", async (req, res) => {
    res.json({ data: await getTermsStatus(db, requireAuth(req)) });
  });

  router.post("/me/terms/accept", async (req, res) => {
    const { version } = parse(acceptTermsSchema, req.body);
    res.json({ data: await acceptTerms(db, requireAuth(req), version, { requestId: req.requestId }) });
  });

  return router;
}
