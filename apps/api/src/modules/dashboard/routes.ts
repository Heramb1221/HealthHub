import { Router } from "express";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import { getDashboardSummary } from "./service.js";

export function createDashboardRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));
  router.use(requireRole("patient"));

  router.get("/", async (req, res) => {
    const summary = await getDashboardSummary(db, requireAuth(req));
    res.json({ data: summary });
  });

  return router;
}
