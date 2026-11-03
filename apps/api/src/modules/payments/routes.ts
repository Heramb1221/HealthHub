import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { parse } from "../../lib/validate.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import { createPaymentOrder, handlePaymentWebhook, listPaymentHistory, paymentConfig, verifyPayment } from "./service.js";

// The amount and currency are decided by the server; a request that tries to set them is rejected.
const createOrderSchema = z.strictObject({ appointmentId: z.uuid() });

const verifyPaymentSchema = z.strictObject({
  orderRef: z.string().min(5).max(100),
  paymentRef: z.string().max(100).optional(),
  signature: z.string().max(256).optional(),
  simulate: z.enum(["success", "failure"]).optional(),
});

export function createPaymentRouter(db: Db, env: Env): Router {
  const router = Router();

  router.get("/config", (_req, res) => {
    res.json({ data: paymentConfig(env) });
  });

  // Called by Razorpay's servers, not by a signed-in user: authenticated by the signature of the raw body.
  router.post("/webhook", async (req, res) => {
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    const result = await handlePaymentWebhook(db, env, rawBody, req.header("x-razorpay-signature"));
    res.json({ data: result });
  });

  router.use(authenticate(db, env));
  router.use(requireRole("patient"));

  router.post("/orders", async (req, res) => {
    const input = parse(createOrderSchema, req.body);
    res.status(201).json({ data: await createPaymentOrder(db, env, requireAuth(req), input, { requestId: req.requestId }) });
  });

  router.post("/verify", async (req, res) => {
    const input = parse(verifyPaymentSchema, req.body);
    res.json({ data: await verifyPayment(db, env, requireAuth(req), input, { requestId: req.requestId }) });
  });

  router.get("/history", async (req, res) => {
    res.json({ data: await listPaymentHistory(db, requireAuth(req)) });
  });

  return router;
}
