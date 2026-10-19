import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { parse } from "../../lib/validate.js";
import { authenticate, requireAuth, requireRole } from "../../middleware/authenticate.js";
import {
  createPaymentOrder,
  listPaymentHistory,
  verifyPayment,
} from "./service.js";

const createOrderSchema = z.strictObject({
  appointmentId: z.uuid(),
  amountPaise: z.coerce.number().int().min(100).max(10_000_000).optional(),
  currency: z.literal("INR").optional(),
});

const verifyPaymentSchema = z.strictObject({
  orderRef: z.string().min(5).max(100),
  paymentRef: z.string().max(100).optional(),
  signature: z.string().max(256).optional(),
  simulateFailure: z.boolean().optional(),
});

export function createPaymentRouter(db: Db, env: Env): Router {
  const router = Router();

  // Public config for frontend checkout integration
  router.get("/config", (_req, res) => {
    res.json({
      data: {
        keyId: env.RAZORPAY_KEY_ID || null,
        isLiveRazorpay: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
        currency: "INR",
      },
    });
  });

  router.use(authenticate(db, env));

  router.use(requireRole("patient"));

  router.post("/orders", async (req, res) => {
    const input = parse(createOrderSchema, req.body);
    const order = await createPaymentOrder(db, env, requireAuth(req), input, { requestId: req.requestId });
    res.status(201).json({ data: order });
  });

  router.post("/verify", async (req, res) => {
    const input = parse(verifyPaymentSchema, req.body);
    const result = await verifyPayment(db, env, requireAuth(req), input, { requestId: req.requestId });
    res.json({ data: result });
  });

  router.get("/history", async (req, res) => {
    const history = await listPaymentHistory(db, requireAuth(req));
    res.json({ data: history });
  });

  return router;
}
