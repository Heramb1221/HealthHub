import { createHmac, timingSafeEqual } from "node:crypto";
import type { Env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";

export type PaymentMode = "razorpay_test" | "razorpay_live" | "simulated" | "unavailable";

/**
 * How payments work in this deployment:
 *  - Razorpay keys set: real gateway (test or live decided by the key prefix);
 *  - no keys, not production: clearly labelled simulated payments for development and demos (no money moves);
 *  - no keys in production: payments are unavailable (never a silent fake).
 */
export function paymentMode(env: Pick<Env, "RAZORPAY_KEY_ID" | "RAZORPAY_KEY_SECRET" | "NODE_ENV">): PaymentMode {
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) return env.RAZORPAY_KEY_ID.startsWith("rzp_test_") ? "razorpay_test" : "razorpay_live";
  return env.NODE_ENV === "production" ? "unavailable" : "simulated";
}

export const SIMULATED_ORDER_PREFIX = "order_sim_";
export const isSimulatedOrder = (orderRef: string) => orderRef.startsWith(SIMULATED_ORDER_PREFIX);

/** Constant-time comparison of two hex signatures. */
export function signaturesMatch(expectedHex: string, providedHex: string): boolean {
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(providedHex, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Razorpay checkout signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function checkoutSignature(secret: string, orderRef: string, paymentRef: string): string {
  return createHmac("sha256", secret).update(`${orderRef}|${paymentRef}`).digest("hex");
}

export function webhookSignature(secret: string, rawBody: Buffer): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: string;
}

async function call<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AppError("BAD_GATEWAY", "The payment provider could not be reached. Nothing was charged; please try again");
  }
  if (!res.ok) throw new AppError("BAD_GATEWAY", `The payment provider refused the request (HTTP ${res.status}). Nothing was charged`);
  return (await res.json()) as T;
}

export const createRazorpayOrder = (env: Env, body: { amount: number; currency: string; receipt: string; notes: Record<string, string> }) =>
  call<{ id: string }>(env, "/orders", { method: "POST", body: JSON.stringify(body) });

/** Ask Razorpay itself what happened to a payment, so a client's word is never the only proof. */
export const fetchRazorpayPayment = (env: Env, paymentId: string) => call<RazorpayPayment>(env, `/payments/${encodeURIComponent(paymentId)}`);
