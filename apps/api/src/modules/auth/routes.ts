import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { z } from "zod";
import { parse } from "../../lib/validate.js";
import { authenticate, requireAuth } from "../../middleware/authenticate.js";
import { loginSchema, registerSchema } from "./schemas.js";
import { login, logout, refresh, register } from "./service.js";

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

  // No body: the bearer token is the only input. Strict, so junk is rejected rather than ignored.
  router.post("/refresh", credentialLimiter, authenticate(db, env), async (req, res) => {
    parse(z.strictObject({}), req.body ?? {});
    const auth = requireAuth(req);
    res.setHeader("Cache-Control", "no-store");
    res.json({ data: await refresh(db, env, auth, { requestId: req.requestId }) });
  });

  router.post("/logout", authenticate(db, env), async (req, res) => {
    await logout(db, requireAuth(req), { requestId: req.requestId });
    res.json({ data: { revoked: true } });
  });

  router.get("/me", authenticate(db, env), async (req, res) => {
    const auth = requireAuth(req);
    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, email: true, role: true, patient: { select: { fullName: true } } },
    });
    if (!user || !user.role) throw new AppError("UNAUTHENTICATED");
    res.json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          displayName: user.patient?.fullName ?? user.email.split("@")[0],
        },
      },
    });
  });

  return router;
}
