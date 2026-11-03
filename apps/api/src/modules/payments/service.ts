import { randomUUID } from "node:crypto";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { log } from "../../lib/logger.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { recordAudit } from "../audit/audit.js";
import {
  checkoutSignature,
  createRazorpayOrder,
  fetchRazorpayPayment,
  isSimulatedOrder,
  paymentMode,
  signaturesMatch,
  SIMULATED_ORDER_PREFIX,
  webhookSignature,
  type PaymentMode,
} from "./razorpay.js";

export interface CreateOrderInput {
  appointmentId: string;
}

export interface VerifyPaymentInput {
  orderRef: string;
  paymentRef?: string;
  signature?: string;
  /** Simulated (no-gateway) orders only; refused for real orders and in production. */
  simulate?: "success" | "failure";
}

const PENDING_ORDER_REUSE_MS = 30 * 60_000;
const CURRENCY = "INR";

export function paymentConfig(env: Env) {
  const mode: PaymentMode = paymentMode(env);
  return {
    mode,
    // The public key id is meant for the browser; the secret never leaves the server.
    keyId: mode === "razorpay_test" || mode === "razorpay_live" ? env.RAZORPAY_KEY_ID : null,
    isLiveRazorpay: mode === "razorpay_live",
    currency: CURRENCY,
    appointmentFeePaise: env.APPOINTMENT_FEE_PAISE,
    appointmentFeeRupees: (env.APPOINTMENT_FEE_PAISE / 100).toFixed(2),
  };
}

type OrderRow = {
  id: string;
  orderRef: string;
  amountPaise: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded";
  isSandbox: boolean;
  paymentRef: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const receiptFor = (orderRef: string) => `RCP-${orderRef.slice(-8).toUpperCase()}`;

function resultDto(o: OrderRow) {
  const simulated = isSimulatedOrder(o.orderRef);
  return {
    id: o.id,
    orderRef: o.orderRef,
    paymentRef: o.paymentRef,
    status: o.status,
    receiptNumber: o.status === "completed" ? receiptFor(o.orderRef) : null,
    amountRupees: (o.amountPaise / 100).toFixed(2),
    currency: o.currency,
    isSandbox: o.isSandbox,
    simulated,
    verifiedAt: o.updatedAt.toISOString(),
  };
}

async function ownPatient(db: Db, auth: AuthContext) {
  const patient = await db.patient.findUnique({ where: { userId: auth.userId }, select: { id: true, fullName: true, phone: true } });
  if (!patient) throw new AppError("NOT_FOUND");
  return patient;
}

export async function createPaymentOrder(db: Db, env: Env, auth: AuthContext, input: CreateOrderInput, ctx: { requestId: string }) {
  const patient = await ownPatient(db, auth);
  const mode = paymentMode(env);
  if (mode === "unavailable") throw new AppError("PROVIDER_DISABLED", "Online payments are not set up yet. Please pay at the hospital");

  const appointment = await db.appointment.findFirst({
    where: { id: input.appointmentId, patientId: patient.id },
    include: { slot: { include: { hospital: { select: { id: true, name: true } } } } },
  });
  if (!appointment) throw new AppError("NOT_FOUND", "Appointment not found for this patient");
  if (appointment.status !== "confirmed") throw new AppError("CONFLICT", "Cannot start a payment for a cancelled appointment");
  if (await db.paymentOrder.findFirst({ where: { appointmentId: appointment.id, status: "completed" } })) {
    throw new AppError("CONFLICT", "Payment has already been completed for this appointment");
  }

  const amountPaise = env.APPOINTMENT_FEE_PAISE; // decided here, never by the client
  const shape = (o: { id: string; orderRef: string; amountPaise: number; currency: string; status: string; isSandbox: boolean; createdAt: Date }) => ({
    id: o.id,
    orderRef: o.orderRef,
    amountPaise: o.amountPaise,
    amountRupees: (o.amountPaise / 100).toFixed(2),
    currency: o.currency,
    status: o.status,
    isSandbox: o.isSandbox,
    simulated: isSimulatedOrder(o.orderRef),
    mode,
    keyId: mode === "razorpay_test" || mode === "razorpay_live" ? env.RAZORPAY_KEY_ID : null,
    hospitalName: appointment.slot.hospital.name,
    slotTime: appointment.slot.startsAt.toISOString(),
    patientName: patient.fullName || "",
    patientPhone: patient.phone || "",
    createdAt: o.createdAt.toISOString(),
  });

  // A double click or a retry must not create a second order (and a second charge opportunity): reuse a recent pending one.
  const recent = await db.paymentOrder.findFirst({
    where: { appointmentId: appointment.id, status: "pending", amountPaise, createdAt: { gte: new Date(Date.now() - PENDING_ORDER_REUSE_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent && (mode === "simulated") === isSimulatedOrder(recent.orderRef)) return shape(recent);

  let orderRef: string;
  if (mode === "simulated") {
    orderRef = `${SIMULATED_ORDER_PREFIX}${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  } else {
    // No silent fallback: if the gateway fails, the patient is told, and no fake order is created.
    orderRef = (
      await createRazorpayOrder(env, {
        amount: amountPaise,
        currency: CURRENCY,
        receipt: `rcpt_${appointment.id.replace(/-/g, "").slice(0, 14)}`,
        notes: { appointmentId: appointment.id },
      })
    ).id;
  }

  const order = await db.paymentOrder.create({
    data: { patientId: patient.id, appointmentId: appointment.id, amountPaise, currency: CURRENCY, status: "pending", orderRef, isSandbox: mode !== "razorpay_live" },
  });
  await recordAudit(db, {
    action: "payment.order_created",
    outcome: "success",
    actorUserId: auth.userId,
    patientId: patient.id,
    resourceType: "payment_order",
    resourceId: order.id,
    requestId: ctx.requestId,
    metadata: { orderRef, amountPaise, currency: CURRENCY, appointmentId: appointment.id, mode },
  });
  return shape(order);
}

async function settle(db: Db, orderId: string, to: "completed" | "failed", paymentRef: string | null): Promise<OrderRow> {
  // Only a pending order (or a failed one being retried) can change; a completed order is final.
  await db.paymentOrder.updateMany({
    where: { id: orderId, status: to === "completed" ? { in: ["pending", "failed"] } : "pending" },
    data: { status: to, paymentRef: to === "completed" ? paymentRef : null },
  });
  return db.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
}

export async function verifyPayment(db: Db, env: Env, auth: AuthContext, input: VerifyPaymentInput, ctx: { requestId: string }) {
  const patient = await ownPatient(db, auth);
  const order = await db.paymentOrder.findFirst({ where: { orderRef: input.orderRef, patientId: patient.id } });
  if (!order) throw new AppError("NOT_FOUND", "Payment order not found");
  if (order.status === "completed") return resultDto(order); // idempotent: verifying twice changes nothing

  const audit = (action: string, outcome: "success" | "failure" | "denied", metadata: Record<string, string>) =>
    recordAudit(db, { action, outcome, actorUserId: auth.userId, patientId: patient.id, resourceType: "payment_order", resourceId: order.id, requestId: ctx.requestId, metadata });

  let finalOrder: OrderRow;
  if (isSimulatedOrder(order.orderRef)) {
    if (paymentMode(env) !== "simulated") throw new AppError("FORBIDDEN", "Simulated payments are not allowed here");
    if (!input.simulate) throw new AppError("VALIDATION_ERROR", "Choose a simulated outcome for this test order");
    finalOrder = await settle(db, order.id, input.simulate === "success" ? "completed" : "failed", input.simulate === "success" ? `pay_sim_${randomUUID().replace(/-/g, "").slice(0, 14)}` : null);
  } else {
    // A real order is only ever settled on proof: the checkout signature AND Razorpay's own record of the payment.
    if (!input.paymentRef || !input.signature) throw new AppError("VALIDATION_ERROR", "Payment proof is required to confirm this payment");
    if (!signaturesMatch(checkoutSignature(env.RAZORPAY_KEY_SECRET, order.orderRef, input.paymentRef), input.signature)) {
      await audit("payment.signature_rejected", "denied", { orderRef: order.orderRef });
      throw new AppError("FORBIDDEN", "The payment could not be verified");
    }
    const other = await db.paymentOrder.findFirst({ where: { paymentRef: input.paymentRef, id: { not: order.id } }, select: { id: true } });
    if (other) throw new AppError("CONFLICT", "This payment is already linked to another order");

    const payment = await fetchRazorpayPayment(env, input.paymentRef);
    if (payment.order_id !== order.orderRef || payment.amount !== order.amountPaise || payment.currency !== order.currency) {
      await audit("payment.mismatch", "denied", { orderRef: order.orderRef });
      throw new AppError("FORBIDDEN", "The payment does not match this order");
    }
    if (payment.status === "captured") finalOrder = await settle(db, order.id, "completed", input.paymentRef);
    else if (payment.status === "failed") finalOrder = await settle(db, order.id, "failed", null);
    else finalOrder = order; // created / authorized: not money in hand yet, so still pending (the webhook completes it)
  }

  await audit(finalOrder.status === "completed" ? "payment.verified" : finalOrder.status === "failed" ? "payment.failed" : "payment.pending", finalOrder.status === "failed" ? "failure" : "success", {
    orderRef: finalOrder.orderRef,
    status: finalOrder.status,
  });
  return resultDto(finalOrder);
}

/**
 * Razorpay webhook: the server-to-server backstop for payments that completed after the browser closed. Authenticated
 * only by the HMAC of the raw body with the webhook secret; every other input is untrusted.
 */
export async function handlePaymentWebhook(db: Db, env: Env, rawBody: Buffer | undefined, signature: string | undefined): Promise<{ handled: boolean }> {
  if (!env.RAZORPAY_WEBHOOK_SECRET) throw new AppError("PROVIDER_DISABLED", "Webhook is not configured");
  if (!rawBody || !signature || !signaturesMatch(webhookSignature(env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature)) {
    throw new AppError("FORBIDDEN", "Invalid webhook signature");
  }
  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; currency?: string; status?: string } } } };
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new AppError("VALIDATION_ERROR", "Malformed webhook body");
  }
  const p = event.payload?.payment?.entity;
  if (!p?.order_id || !p.id) return { handled: false };
  const order = await db.paymentOrder.findUnique({ where: { orderRef: p.order_id } });
  if (!order || isSimulatedOrder(order.orderRef)) return { handled: false };
  if (p.amount !== order.amountPaise || p.currency !== order.currency) {
    log("warn", "Webhook amount/currency mismatch ignored", { orderId: order.id });
    return { handled: false };
  }
  let settled: OrderRow | null = null;
  if ((event.event === "payment.captured" || event.event === "order.paid") && p.status === "captured") settled = await settle(db, order.id, "completed", p.id);
  else if (event.event === "payment.failed") settled = await settle(db, order.id, "failed", null);
  if (settled) {
    await recordAudit(db, {
      action: settled.status === "completed" ? "payment.verified" : "payment.failed",
      outcome: settled.status === "completed" ? "success" : "failure",
      patientId: order.patientId,
      resourceType: "payment_order",
      resourceId: order.id,
      metadata: { orderRef: order.orderRef, status: settled.status, via: "webhook" },
    });
  }
  return { handled: settled !== null };
}

export async function listPaymentHistory(db: Db, auth: AuthContext) {
  const patient = await ownPatient(db, auth);
  const orders = await db.paymentOrder.findMany({
    where: { patientId: patient.id },
    include: { appointment: { include: { slot: { include: { hospital: { select: { id: true, name: true, city: true } } } } } } },
    orderBy: { createdAt: "desc" },
  });
  return orders.map((o) => ({
    id: o.id,
    orderRef: o.orderRef,
    paymentRef: o.paymentRef,
    amountPaise: o.amountPaise,
    amountRupees: (o.amountPaise / 100).toFixed(2),
    currency: o.currency,
    status: o.status,
    isSandbox: o.isSandbox,
    simulated: isSimulatedOrder(o.orderRef),
    receiptNumber: o.status === "completed" ? receiptFor(o.orderRef) : null,
    appointmentId: o.appointmentId,
    hospitalName: o.appointment?.slot.hospital.name ?? "Clinic consultation",
    appointmentTime: o.appointment?.slot.startsAt.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
  }));
}
