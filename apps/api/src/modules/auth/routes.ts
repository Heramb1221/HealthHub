import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { authenticate, requireAuth } from "../../middleware/authenticate.js";
import { devLoginSchema, loginSchema, registerSchema } from "./schemas.js";
import { devLogin, login, logout, register } from "./service.js";

export function createAuthRouter(db: Db, env: Env): Router {
  const router = Router();

  // Tighter than the global limit: these are the brute-force targets.
  const credentialLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError("RATE_LIMITED")),
  });

  router.post("/register", credentialLimiter, async (req, res) => {
    const input = parse(registerSchema, req.body);
    const result = await register(db, env, input, { requestId: req.requestId });
    res.status(201).json({ data: result });
  });

  router.post("/login", credentialLimiter, async (req, res) => {
    const input = parse(loginSchema, req.body);
    const result = await login(db, env, input, { requestId: req.requestId });
    res.json({ data: result });
  });

  router.post("/logout", authenticate(db, env), async (req, res) => {
    await logout(db, requireAuth(req), { requestId: req.requestId });
    res.json({ data: { revoked: true } });
  });

  // DEVELOPMENT ONLY. Not mounted unless explicitly enabled; env validation
  // already refuses to start with it enabled in production.
  if (env.DEV_AUTH_ENABLED && env.NODE_ENV !== "production") {
    router.post("/dev-login", credentialLimiter, async (req, res) => {
      const input = parse(devLoginSchema, req.body);
      const result = await devLogin(db, env, input, { requestId: req.requestId });
      res.setHeader("X-HealthHub-Dev-Only", "true");
      res.json({
        data: { ...result, devOnly: true, notice: "Development-only login. Not available in production." },
      });
    });
  }

  return router;
}
