import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { authenticate } from "../../middleware/authenticate.js";
import { assessSymptoms, getRuleBasedQuestions } from "./service.js";

const symptomAnswerSchema = z.strictObject({
  questionId: z.string().min(1),
  questionText: z.string().min(1),
  selectedOptionId: z.string().min(1),
  selectedOptionLabel: z.string().min(1),
});

const assessSymptomSchema = z.strictObject({
  symptoms: z.array(z.string().min(1).max(100)).min(1, "At least one symptom is required").max(10),
  description: z.string().max(1000).optional(),
  durationDays: z.coerce.number().int().min(0).max(365).optional(),
  severity: z.enum(["mild", "moderate", "severe"]).optional(),
  patientAge: z.coerce.number().int().min(0).max(120).optional(),
  answers: z.array(symptomAnswerSchema).optional(),
});

const questionsSchema = z.strictObject({
  symptoms: z.array(z.string().min(1).max(100)).min(1, "At least one symptom is required").max(10),
});

export function createSymptomRouter(db: Db, env: Env): Router {
  const router = Router();
  router.use(authenticate(db, env));

  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError("RATE_LIMITED")),
  });

  router.post("/questions", limiter, async (req, res) => {
    const input = parse(questionsSchema, req.body);
    const questions = getRuleBasedQuestions(input.symptoms);
    res.json({ data: { questions } });
  });

  router.post("/assess", limiter, async (req, res) => {
    const input = parse(assessSymptomSchema, req.body);
    const result = await assessSymptoms(env, input);
    res.json({ data: result });
  });

  return router;
}
