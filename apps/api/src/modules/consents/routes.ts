import { Router } from "express";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { parse, uuidParam } from "../../lib/validate.js";
import { authenticate, requireAuth } from "../../middleware/authenticate.js";
import { createConsentSchema, listConsentsQuerySchema } from "./schemas.js";
import { createConsent, listConsents, revokeConsent } from "./service.js";

export function createConsentRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));

  router.get("/", async (req, res) => {
    const query = parse(listConsentsQuerySchema, req.query);
    res.json(await listConsents(db, requireAuth(req), query));
  });

  router.post("/", async (req, res) => {
    const input = parse(createConsentSchema, req.body);
    const consent = await createConsent(db, requireAuth(req), input, { requestId: req.requestId });
    res.status(201).json({ data: consent });
  });

  router.delete("/:consentId", async (req, res) => {
    const consentId = uuidParam(req.params.consentId);
    const consent = await revokeConsent(db, requireAuth(req), consentId, { requestId: req.requestId });
    res.json({ data: consent });
  });

  return router;
}
