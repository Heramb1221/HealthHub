import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { checkoutSignature, webhookSignature } from "../../src/modules/payments/razorpay.js";
import { TEST_DATABASE_URL, closeHarness, openHarness, type Harness } from "./helpers.js";
import { bearer, buildApp, registerPatient, testEnv } from "./appHelpers.js";

const KEY = "rzp_test_synthetic";
const SECRET = "synthetic-secret";
const WEBHOOK = "synthetic-webhook-secret";

describe.skipIf(!TEST_DATABASE_URL)("payments", () => {
  let h: Harness;
  const url = TEST_DATABASE_URL as string;
  const sim = () => buildApp(h.db, testEnv(url)); // no gateway keys, not production: simulated mode
  const real = () => buildApp(h.db, testEnv(url, { RAZORPAY_KEY_ID: KEY, RAZORPAY_KEY_SECRET: SECRET, RAZORPAY_WEBHOOK_SECRET: WEBHOOK }));
  let n = 0;

  beforeAll(async () => {
    h = await openHarness(url);
  });
  afterAll(async () => closeHarness(h));
  afterEach(() => vi.unstubAllGlobals());

  async function patientWithAppointment(app: ReturnType<typeof buildApp>) {
    const p = await registerPatient(app, h.db);
    const hospital = await h.db.hospital.create({ data: { name: `Pay Hospital ${process.pid}-${(n += 1)}`, isDemo: true } });
    const startsAt = new Date(Date.now() + 48 * 3_600_000);
    const slot = await h.db.availabilitySlot.create({ data: { hospitalId: hospital.id, startsAt, endsAt: new Date(startsAt.getTime() + 1_800_000) } });
    const booked = await request(app).post("/api/v1/appointments").set(bearer(p.token)).send({ slotId: slot.id });
    expect(booked.status).toBe(201);
    return { ...p, appointmentId: booked.body.data.id as string };
  }
  const order = (app: ReturnType<typeof buildApp>, token: string, body: object) => request(app).post("/api/v1/payments/orders").set(bearer(token)).send(body);
  const verify = (app: ReturnType<typeof buildApp>, token: string, body: object) => request(app).post("/api/v1/payments/verify").set(bearer(token)).send(body);
  const razorpayStub = (payment: Record<string, unknown>) => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      if (u.endsWith("/orders")) return new Response(JSON.stringify({ id: `order_synthetic${Date.now()}${(n += 1)}` }), { status: 200 });
      return new Response(JSON.stringify(payment), { status: 200 });
    }));
  };

  it("exposes the mode without any secret, and refuses to invent payments in production without keys", async () => {
    const cfg = await request(real()).get("/api/v1/payments/config");
    expect(cfg.body.data).toMatchObject({ mode: "razorpay_test", keyId: KEY, appointmentFeePaise: 50000 });
    expect(JSON.stringify(cfg.body)).not.toContain(SECRET);
    expect((await request(sim()).get("/api/v1/payments/config")).body.data).toMatchObject({ mode: "simulated", keyId: null });
    const prod = buildApp(h.db, testEnv(url, { NODE_ENV: "production", QR_LINK_BASE: "https://app.example.com/" }));
    expect((await request(prod).get("/api/v1/payments/config")).body.data.mode).toBe("unavailable");
  });

  it("decides the amount on the server: a client-supplied amount is refused", async () => {
    const app = sim();
    const p = await patientWithAppointment(app);
    expect((await order(app, p.token, { appointmentId: p.appointmentId, amountPaise: 100 })).status).toBe(400);
    const ok = await order(app, p.token, { appointmentId: p.appointmentId });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ amountPaise: 50000, currency: "INR", simulated: true, mode: "simulated" });
  });

  it("reuses a recent pending order instead of creating a second one (double click / retry)", async () => {
    const app = sim();
    const p = await patientWithAppointment(app);
    const a = await order(app, p.token, { appointmentId: p.appointmentId });
    const b = await order(app, p.token, { appointmentId: p.appointmentId });
    expect(b.body.data.orderRef).toBe(a.body.data.orderRef);
    expect(await h.db.paymentOrder.count({ where: { appointmentId: p.appointmentId } })).toBe(1);
  });

  it("simulated orders need an explicit outcome and are final once completed", async () => {
    const app = sim();
    const p = await patientWithAppointment(app);
    const o = (await order(app, p.token, { appointmentId: p.appointmentId })).body.data;
    expect((await verify(app, p.token, { orderRef: o.orderRef })).status).toBe(400); // no outcome: nothing happens
    const done = await verify(app, p.token, { orderRef: o.orderRef, simulate: "success" });
    expect(done.body.data).toMatchObject({ status: "completed", simulated: true });
    expect(done.body.data.receiptNumber).toMatch(/^RCP-/);
    const again = await verify(app, p.token, { orderRef: o.orderRef, simulate: "failure" }); // cannot undo a completed payment
    expect(again.body.data.status).toBe("completed");
    expect((await order(app, p.token, { appointmentId: p.appointmentId })).status).toBe(409); // already paid
  });

  it("another patient cannot verify or see your order", async () => {
    const app = sim();
    const a = await patientWithAppointment(app);
    const b = await registerPatient(app, h.db);
    const o = (await order(app, a.token, { appointmentId: a.appointmentId })).body.data;
    expect((await verify(app, b.token, { orderRef: o.orderRef, simulate: "success" })).status).toBe(404);
    expect((await order(app, b.token, { appointmentId: a.appointmentId })).status).toBe(404);
  });

  it("REAL orders can never be completed without proof (the old endpoint completed them on a bare request)", async () => {
    const app = real();
    razorpayStub({});
    const p = await patientWithAppointment(app);
    const o = (await order(app, p.token, { appointmentId: p.appointmentId })).body.data;
    expect(o.simulated).toBe(false);
    expect((await verify(app, p.token, { orderRef: o.orderRef })).status).toBe(400);
    expect((await verify(app, p.token, { orderRef: o.orderRef, simulate: "success" })).status).toBe(400);
    expect((await verify(app, p.token, { orderRef: o.orderRef, paymentRef: "pay_x", signature: "0".repeat(64) })).status).toBe(403);
    expect((await h.db.paymentOrder.findFirstOrThrow({ where: { orderRef: o.orderRef } })).status).toBe("pending");
  });

  it("completes a real order only when the signature is valid AND Razorpay confirms the payment, order and amount", async () => {
    const app = real();
    const p = await patientWithAppointment(app);
    razorpayStub({});
    const o = (await order(app, p.token, { appointmentId: p.appointmentId })).body.data;
    const proof = { orderRef: o.orderRef, paymentRef: "pay_synthetic1", signature: checkoutSignature(SECRET, o.orderRef, "pay_synthetic1") };

    razorpayStub({ id: "pay_synthetic1", order_id: o.orderRef, amount: 100, currency: "INR", status: "captured" }); // wrong amount
    expect((await verify(app, p.token, proof)).status).toBe(403);
    razorpayStub({ id: "pay_synthetic1", order_id: "order_other", amount: 50000, currency: "INR", status: "captured" }); // wrong order
    expect((await verify(app, p.token, proof)).status).toBe(403);
    razorpayStub({ id: "pay_synthetic1", order_id: o.orderRef, amount: 50000, currency: "INR", status: "authorized" }); // not captured yet
    expect((await verify(app, p.token, proof)).body.data.status).toBe("pending");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 }))); // gateway down: never guess success
    expect((await verify(app, p.token, proof)).status).toBe(502);

    razorpayStub({ id: "pay_synthetic1", order_id: o.orderRef, amount: 50000, currency: "INR", status: "captured" });
    const ok = await verify(app, p.token, proof);
    expect(ok.body.data).toMatchObject({ status: "completed", simulated: false, paymentRef: "pay_synthetic1" });
    expect(JSON.stringify(await h.db.auditEvent.findMany({ where: { resourceId: o.id } }))).not.toContain(proof.signature);
  });

  it("does not create a fake order when the gateway fails", async () => {
    const app = real();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const p = await patientWithAppointment(app);
    expect((await order(app, p.token, { appointmentId: p.appointmentId })).status).toBe(502);
    expect(await h.db.paymentOrder.count({ where: { appointmentId: p.appointmentId } })).toBe(0);
  });

  it("webhook: rejects bad signatures, completes a matching captured payment once, ignores mismatched amounts", async () => {
    const app = real();
    razorpayStub({});
    const p = await patientWithAppointment(app);
    const o = (await order(app, p.token, { appointmentId: p.appointmentId })).body.data;
    const body = (amount: number) => JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_hook1", order_id: o.orderRef, amount, currency: "INR", status: "captured" } } } });
    const post = (raw: string, sig: string) => request(app).post("/api/v1/payments/webhook").set("Content-Type", "application/json").set("x-razorpay-signature", sig).send(raw);

    expect((await post(body(50000), "bad")).status).toBe(403);
    const wrong = body(1);
    expect((await post(wrong, webhookSignature(WEBHOOK, Buffer.from(wrong)))).body.data.handled).toBe(false);
    expect((await h.db.paymentOrder.findFirstOrThrow({ where: { orderRef: o.orderRef } })).status).toBe("pending");
    const good = body(50000);
    expect((await post(good, webhookSignature(WEBHOOK, Buffer.from(good)))).body.data.handled).toBe(true);
    expect((await h.db.paymentOrder.findFirstOrThrow({ where: { orderRef: o.orderRef } })).status).toBe("completed");
    const failedLater = JSON.stringify({ event: "payment.failed", payload: { payment: { entity: { id: "pay_hook2", order_id: o.orderRef, amount: 50000, currency: "INR", status: "failed" } } } });
    await post(failedLater, webhookSignature(WEBHOOK, Buffer.from(failedLater)));
    expect((await h.db.paymentOrder.findFirstOrThrow({ where: { orderRef: o.orderRef } })).status).toBe("completed"); // a late failure cannot undo it
  });
});
