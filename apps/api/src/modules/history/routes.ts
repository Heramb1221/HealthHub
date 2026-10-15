import { Router } from "express";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { parse } from "../../lib/validate.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import { addConditionSchema, listHistoryQuerySchema } from "./schemas.js";
import { addCondition, listHistory } from "./service.js";

export function createHistoryRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));
  // Owner, or a provider with a live consent: the service decides.
  router.get("/", async (req, res) => {
    const query = parse(listHistoryQuerySchema, req.query);
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await listHistory(db, requireAuth(req), query, { requestId: req.requestId }));
  });
  router.post("/conditions", requireRole("patient"), async (req, res) => {
    res.status(201).json({ data: await addCondition(db, requireAuth(req), parse(addConditionSchema, req.body), { requestId: req.requestId }) });
  });
  return router;
}
