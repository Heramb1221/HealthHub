import { randomUUID } from "node:crypto";
import type { Db } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
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
  simulateFailure?: boolean;
}

export async function createPaymentOrder(
  db: Db,
  auth: AuthContext,
  input: CreateOrderInput,
  ctx: { requestId: string },
) {
  const patient = await db.patient.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
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

  const orderRef = `order_demo_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const amountPaise = input.amountPaise ?? 50000; // ₹500 standard demo fee
  const currency = input.currency ?? "INR";

  const order = await db.paymentOrder.create({
    data: {
      patientId: patient.id,
      appointmentId: appointment.id,
      amountPaise,
      currency,
      status: "pending",
      orderRef,
      isSandbox: true,
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
    hospitalName: appointment.slot.hospital.name,
    slotTime: appointment.slot.startsAt.toISOString(),
    createdAt: order.createdAt.toISOString(),
  };
}

export async function verifyPayment(
  db: Db,
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

  const paymentRef = input.paymentRef || `pay_demo_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
  const isSuccess = !input.simulateFailure;
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
