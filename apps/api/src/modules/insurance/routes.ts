import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { parse, uuidParam } from "../../lib/validate.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import {
  createPatientPolicy,
  deletePatientPolicy,
  listInsuranceProviders,
  listPatientPolicies,
} from "./service.js";

const createPolicySchema = z.strictObject({
  providerName: z.string().min(2).max(100),
  policyNumber: z.string().min(3).max(50),
  policyHolderName: z.string().min(2).max(100).optional(),
  sumInsured: z.string().max(50).optional(),
  validFrom: z.string().date().optional(),
  validTill: z.string().date().optional(),
  tpaContact: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
});

export function createInsuranceRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));

  // Public/all authenticated users can list recognized insurance providers
  router.get("/providers", async (_req, res) => {
    const providers = await listInsuranceProviders();
    res.json({ data: providers });
  });

  // Patient policy management
  router.get("/policies", requireRole("patient"), async (req, res) => {
    const policies = await listPatientPolicies(db, requireAuth(req));
    res.json({ data: policies });
  });

  router.post("/policies", requireRole("patient"), async (req, res) => {
    const input = parse(createPolicySchema, req.body);
    const policy = await createPatientPolicy(db, requireAuth(req), input);
    res.status(201).json({ data: policy });
  });

  router.delete("/policies/:policyId", requireRole("patient"), async (req, res) => {
    const result = await deletePatientPolicy(db, requireAuth(req), uuidParam(req.params.policyId));
    res.json({ data: result });
  });

  return router;
}
