import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { authenticate, requireAuth } from "../../middleware/authenticate.js";
import { recordAudit } from "../audit/audit.js";

const HEALTH_ID = /^HH-[A-Za-z0-9]{8}$/;

/**
 * Emergency summary opened from the health-card QR (`<link base>qr/<healthId>`).
 *
 * The QR itself holds only the Health ID, never medical data. This lookup is NOT public:
 *  - anonymous callers are refused (401);
 *  - a patient may only read their own summary (anyone else's ID looks like "not found");
 *  - a signed-in care provider may read the small emergency summary (name, blood group, allergies,
 *    emergency contact). That is "break-glass" access for first response, so every read is audited;
 *  - other roles are refused.
 * It is rate limited per user to blunt ID guessing. Full records still need the consent model.
 */
export function createEmergencyRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));
  router.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.EMERGENCY_RATE_LIMIT_MAX,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      keyGenerator: (req) => `${requireAuth(req).userId}`,
      validate: { keyGeneratorIpFallback: false },
      handler: (_req, _res, next) => next(new AppError("RATE_LIMITED")),
    }),
  );

  router.get("/:healthId", async (req, res) => {
    const auth = requireAuth(req);
    const healthId = String(req.params.healthId).trim();
    const audit = (outcome: "success" | "denied" | "failure", patientId: string | null, metadata: Record<string, string>) =>
      recordAudit(db, {
        action: "emergency.profile_viewed",
        outcome,
        actorUserId: auth.userId,
        patientId,
        resourceType: "emergency_profile",
        requestId: req.requestId,
        metadata,
      });

    if (auth.role !== "patient" && auth.role !== "provider") {
      await audit("denied", null, { reason: "role_not_permitted" });
      throw new AppError("FORBIDDEN");
    }
    if (!HEALTH_ID.test(healthId)) throw new AppError("NOT_FOUND");

    const patient = await db.patient.findUnique({
      where: { healthId },
      select: {
        id: true,
        userId: true,
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

    if (auth.role === "patient" && patient.userId !== auth.userId) {
      // Same answer as an unknown ID, so one patient cannot probe which IDs exist.
      await audit("denied", patient.id, { reason: "not_owner" });
      throw new AppError("NOT_FOUND");
    }
    await audit("success", patient.id, { basis: auth.role === "patient" ? "self" : "emergency_provider_access" });

    res.setHeader("Cache-Control", "private, no-store");
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
        notice: "Emergency summary only. Full records need patient consent. This is a Sehat Meds identifier, not an official national health ID.",
      },
    });
  });

  return router;
}
