import { createHmac, randomUUID } from "node:crypto";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { log } from "../../lib/logger.js";
import type { AuthContext } from "../../middleware/authenticate.js";
import { recordAudit } from "../audit/audit.js";

export interface CreateOrderInput {
  appointmentId: string;
  amountPaise?: number; // Defaults to standard consultation fee (e.g. ₹500 = 50000 paise)
  currency?: string;
}

export interface VerifyPaymentInput {
  orderRef: string;
  paymentRef?: string;
  signature?: string;
  simulateFailure?: boolean;
}

export async function createPaymentOrder(
  db: Db,
  env: Env,
  auth: AuthContext,
  input: CreateOrderInput,
  ctx: { requestId: string },
) {
  const patient = await db.patient.findUnique({
    where: { userId: auth.userId },
    select: { id: true, fullName: true, phone: true },
  });
  if (!patient) throw new AppError("NOT_FOUND");

  const appointment = await db.appointment.findFirst({
    where: { id: input.appointmentId, patientId: patient.id },
    include: {
      slot: {
        include: {
          hospital: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!appointment) throw new AppError("NOT_FOUND", "Appointment not found for this patient");
  if (appointment.status !== "confirmed") {
    throw new AppError("CONFLICT", "Cannot initiate payment for cancelled appointment");
  }

  // Check if there is already a completed payment order for this appointment
  const existingCompleted = await db.paymentOrder.findFirst({
    where: { appointmentId: appointment.id, status: "completed" },
  });
  if (existingCompleted) {
    throw new AppError("CONFLICT", "Payment has already been completed for this appointment");
  }

  const amountPaise = input.amountPaise ?? 50000; // ₹500 standard fee
  const currency = input.currency ?? "INR";
  let orderRef = `order_demo_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  let isSandbox = true;

  // Real Razorpay Order Creation via REST API if configured
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
    try {
      const basicAuth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
      const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${basicAuth}`,
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency,
          receipt: `rcpt_${appointment.id.replace(/-/g, "").slice(0, 14)}`,
          notes: {
            appointmentId: appointment.id,
            hospitalName: appointment.slot.hospital.name,
            patientId: patient.id,
          },
        }),
      });

      if (rzpRes.ok) {
        const rzpData = (await rzpRes.json()) as { id: string };
        orderRef = rzpData.id;
        isSandbox = env.RAZORPAY_KEY_ID.startsWith("rzp_test_");
        log("info", "Razorpay order created successfully", { orderId: orderRef, appointmentId: appointment.id });
      } else {
        const errorText = await rzpRes.text();
        log("warn", "Razorpay API order creation failed, falling back to simulated order", { error: errorText });
      }
    } catch (err) {
      log("warn", "Failed to reach Razorpay API", { error: String(err) });
    }
  }

  const order = await db.paymentOrder.create({
    data: {
      patientId: patient.id,
      appointmentId: appointment.id,
      amountPaise,
      currency,
      status: "pending",
      orderRef,
      isSandbox,
    },
  });

  await recordAudit(db, {
    action: "payment.order_created",
    outcome: "success",
    actorUserId: auth.userId,
    patientId: patient.id,
    resourceType: "payment_order",
    resourceId: order.id,
    requestId: ctx.requestId,
    metadata: { orderRef, amountPaise, currency, appointmentId: appointment.id },
  });

  return {
    id: order.id,
    orderRef: order.orderRef,
    amountPaise: order.amountPaise,
    amountRupees: (order.amountPaise / 100).toFixed(2),
    currency: order.currency,
    status: order.status,
    isSandbox: order.isSandbox,
    keyId: env.RAZORPAY_KEY_ID || null,
    hospitalName: appointment.slot.hospital.name,
    slotTime: appointment.slot.startsAt.toISOString(),
    patientName: patient.fullName || "Valued Patient",
    patientPhone: patient.phone || "",
    createdAt: order.createdAt.toISOString(),
  };
}

export async function verifyPayment(
  db: Db,
  env: Env,
  auth: AuthContext,
  input: VerifyPaymentInput,
  ctx: { requestId: string },
) {
  const patient = await db.patient.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });
  if (!patient) throw new AppError("NOT_FOUND");

  const order = await db.paymentOrder.findFirst({
    where: { orderRef: input.orderRef, patientId: patient.id },
  });
  if (!order) throw new AppError("NOT_FOUND", "Payment order not found");

  if (order.status === "completed") {
    return {
      id: order.id,
      orderRef: order.orderRef,
      paymentRef: order.paymentRef,
      status: order.status,
      receiptNumber: `RCP-${order.orderRef.slice(-8).toUpperCase()}`,
      amountRupees: (order.amountPaise / 100).toFixed(2),
      isSandbox: order.isSandbox,
      verifiedAt: order.updatedAt.toISOString(),
    };
  }

  let isSuccess = !input.simulateFailure;

  // Cryptographic Razorpay Signature Verification
  if (input.signature && input.paymentRef && env.RAZORPAY_KEY_SECRET) {
    const textToSign = `${input.orderRef}|${input.paymentRef}`;
    const expectedSignature = createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(textToSign)
      .digest("hex");

    if (input.signature !== expectedSignature) {
      log("warn", "Razorpay signature mismatch", {
        orderRef: input.orderRef,
        provided: input.signature,
        expected: expectedSignature,
      });
      throw new AppError("FORBIDDEN", "Cryptographic signature verification failed");
    }
    isSuccess = true;
    log("info", "Razorpay payment signature cryptographically verified", { orderRef: input.orderRef, paymentId: input.paymentRef });
  }

  const paymentRef = input.paymentRef || `pay_demo_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
  const newStatus = isSuccess ? "completed" : "failed";

  const updated = await db.paymentOrder.update({
    where: { id: order.id },
    data: {
      status: newStatus,
      paymentRef: isSuccess ? paymentRef : null,
    },
  });

  await recordAudit(db, {
    action: isSuccess ? "payment.verified" : "payment.failed",
    outcome: isSuccess ? "success" : "failure",
    actorUserId: auth.userId,
    patientId: patient.id,
    resourceType: "payment_order",
    resourceId: updated.id,
    requestId: ctx.requestId,
    metadata: { orderRef: updated.orderRef, paymentRef: updated.paymentRef ?? "none", status: updated.status },
  });

  return {
    id: updated.id,
    orderRef: updated.orderRef,
    paymentRef: updated.paymentRef,
    status: updated.status,
    receiptNumber: isSuccess ? `RCP-${updated.orderRef.slice(-8).toUpperCase()}` : null,
    amountRupees: (updated.amountPaise / 100).toFixed(2),
    currency: updated.currency,
    isSandbox: updated.isSandbox,
    verifiedAt: updated.updatedAt.toISOString(),
  };
}

export async function listPaymentHistory(db: Db, auth: AuthContext) {
  const patient = await db.patient.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });
  if (!patient) throw new AppError("NOT_FOUND");

  const orders = await db.paymentOrder.findMany({
    where: { patientId: patient.id },
    include: {
      appointment: {
        include: {
          slot: {
            include: {
              hospital: { select: { id: true, name: true, city: true } },
            },
          },
        },
      },
    },
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
    hospitalName: o.appointment?.slot.hospital.name ?? "Clinic Consultation",
    appointmentTime: o.appointment?.slot.startsAt.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
  }));
}
