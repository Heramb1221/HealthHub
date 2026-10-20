import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { parse, uuidParam } from "../../lib/validate.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import { createQrSession, getQrSession, revokeQrSession } from "./service.js";

const createSchema = z.strictObject({ prescriptionId: z.uuid() });

export function createQrRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));

  const createLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.QR_RATE_LIMIT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError("RATE_LIMITED")),
  });

  router.post("/", requireRole("patient"), createLimiter, async (req, res) => {
    const { prescriptionId } = parse(createSchema, req.body);
    res.status(201).json({ data: await createQrSession(db, env, requireAuth(req), prescriptionId, { requestId: req.requestId }) });
  });

  router.get("/:sessionId", async (req, res) => {
    const data = await getQrSession(db, requireAuth(req), uuidParam(req.params.sessionId), { requestId: req.requestId });
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data });
  });

  router.delete("/:sessionId", requireRole("patient"), async (req, res) => {
    res.json({ data: await revokeQrSession(db, env, requireAuth(req), uuidParam(req.params.sessionId), { requestId: req.requestId }) });
  });

  router.get("/emergency/:healthId", async (req, res) => {
    const healthId = String(req.params.healthId).trim();
    const patient = await db.patient.findUnique({
      where: { healthId },
      select: {
        id: true,
        healthId: true,
        fullName: true,
        bloodGroup: true,
        allergies: true,
        emergencyContactName: true,
        emergencyContactRelationship: true,
        emergencyContactPhone: true,
      },
    });
    if (!patient) throw new AppError("NOT_FOUND");
    res.json({
      data: {
        healthId: patient.healthId,
        fullName: patient.fullName,
        bloodGroup: patient.bloodGroup,
        criticalAllergies: patient.allergies,
        emergencyContact: {
          name: patient.emergencyContactName,
          relationship: patient.emergencyContactRelationship,
          phone: patient.emergencyContactPhone,
        },
        notice: "Emergency informational access only. Critical medical response data.",
      },
    });
  });

  return router;
}
