import { Router } from "express";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import { queryVaccinationsSchema, recordVaccinationSchema } from "./schemas.js";
import { deleteVaccination, listVaccinations, recordVaccination } from "./service.js";

export function createVaccinationRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));

  router.get("/", async (req, res) => {
    const query = parse(queryVaccinationsSchema, req.query);
    res.setHeader("Cache-Control", "private, no-store");
    const result = await listVaccinations(db, requireAuth(req), query, { requestId: req.requestId });
    res.json(result);
  });

  router.post("/", requireRole("patient"), async (req, res) => {
    const input = parse(recordVaccinationSchema, req.body);
    const result = await recordVaccination(db, requireAuth(req), input, { requestId: req.requestId });
    res.status(200).json({ data: result });
  });

  router.delete("/:vaccineName", requireRole("patient"), async (req, res) => {
    const vaccineName = req.params.vaccineName;
    if (typeof vaccineName !== "string" || !vaccineName.trim()) {
      throw new AppError("VALIDATION_ERROR");
    }
    const result = await deleteVaccination(db, requireAuth(req), vaccineName, { requestId: req.requestId });
    res.json({ data: result });
  });

  return router;
}
