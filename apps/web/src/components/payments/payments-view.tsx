"use client";

import { AlertCircle, CheckCircle2, Clock, CreditCard, LoaderCircle, Receipt, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { isNoPatientError, NoPatientProfile } from "@/components/feedback/no-patient";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { appointmentsApi } from "@/lib/api/appointments";
import { describeError } from "@/lib/api/errors";
import { paymentsApi } from "@/lib/api/payments";
import type { PaymentConfig, PaymentHistoryItem, PaymentOrder, PaymentVerificationResult } from "@/lib/api/types";
import { formatDayLong, formatTime } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayCtor = new (options: Record<string, unknown>) => { open(): void; on(event: string, cb: (r: { error?: { description?: string } }) => void): void };
const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

const MODE_TEXT: Record<PaymentConfig["mode"], { tone: "success" | "warning" | "neutral"; title: string; body: string }> = {
  razorpay_test: { tone: "warning", title: "Test payments (Razorpay sandbox)", body: "No real money moves. Use Razorpay's test cards or UPI." },
  razorpay_live: { tone: "success", title: "Secure payments by Razorpay", body: "Cards, UPI and net banking. Your payment is confirmed by Razorpay, not by this page." },
  simulated: { tone: "warning", title: "Development test payments", body: "No payment gateway is connected. Outcomes below are simulated and no money moves." },
  unavailable: { tone: "neutral", title: "Online payment is not available yet", body: "Please pay at the hospital for now." },
};

/** Loads Razorpay's checkout script once and tells us honestly if it could not load (blocked, offline). */
function useRazorpayScript(enabled: boolean): "idle" | "loading" | "ready" | "failed" {
  const [state, setState] = React.useState<"idle" | "loading" | "ready" | "failed">("idle");
  React.useEffect(() => {
    if (!enabled) return;
    const w = window as unknown as { Razorpay?: RazorpayCtor };
    if (w.Razorpay) {
      queueMicrotask(() => setState("ready"));
      return;
    }
    queueMicrotask(() => setState("loading"));
    let script = document.getElementById("razorpay-checkout-js") as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = "razorpay-checkout-js";
      script.src = CHECKOUT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
    const ok = () => setState("ready");
    const fail = () => setState("failed");
    script.addEventListener("load", ok);
    script.addEventListener("error", fail);
    return () => {
      script?.removeEventListener("load", ok);
      script?.removeEventListener("error", fail);
    };
  }, [enabled]);
  return state;
}

export function PaymentsView() {
  const config = useResource(() => paymentsApi.getConfig(), "payment-config");
  const appointments = useResource(() => appointmentsApi.list(), "appointments");
  const history = useResource(() => paymentsApi.listHistory(), "payment-history");

  const [order, setOrder] = React.useState<PaymentOrder | null>(null);
  const [creatingFor, setCreatingFor] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [result, setResult] = React.useState<PaymentVerificationResult | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const mode = config.status === "ready" ? config.data.mode : null;
  const usesGateway = mode === "razorpay_test" || mode === "razorpay_live";
  const script = useRazorpayScript(usesGateway);

  const paidAppointmentIds = new Set(history.status === "ready" ? history.data.filter((h) => h.status === "completed").map((h) => h.appointmentId) : []);
  const payable =
    appointments.status === "ready"
      ? appointments.data.filter((a) => a.status === "booked" && new Date(a.startsAt) > new Date() && !paidAppointmentIds.has(a.id))
      : [];

  async function confirmWithServer(input: Parameters<typeof paymentsApi.verifyPayment>[0]) {
    setConfirming(true);
    try {
      // The screen never decides a payment succeeded: only the server's answer does.
      const res = await paymentsApi.verifyPayment(input);
      setResult(res);
      if (res.status === "completed") toast.success("Payment confirmed", { description: `Receipt ${res.receiptNumber ?? ""}` });
      else if (res.status === "pending") toast.info("Payment not confirmed yet", { description: "We'll show it as paid only once the bank confirms. Check back shortly." });
      else toast.error("Payment failed", { description: "You have not been charged for this attempt, or it will be refunded by your bank." });
      await Promise.all([history.reload(), appointments.reload()]);
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error(title, { description: detail });
    } finally {
      setConfirming(false);
    }
  }

  function openCheckout(o: PaymentOrder) {
    const Razorpay = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
    if (!Razorpay || !o.keyId) {
      toast.error("The payment window could not open", { description: "Check your connection or ad blocker, then try again." });
      return;
    }
    const checkout = new Razorpay({
      key: o.keyId,
      amount: o.amountPaise,
      currency: o.currency,
      name: "Sehat Meds",
      description: `Consultation fee at ${o.hospitalName}`,
      order_id: o.orderRef,
      prefill: { name: o.patientName || "", contact: o.patientPhone || "" },
      theme: { color: "#12355b" },
      handler: (r: RazorpayResponse) => void confirmWithServer({ orderRef: r.razorpay_order_id, paymentRef: r.razorpay_payment_id, signature: r.razorpay_signature }),
      modal: { ondismiss: () => setNotice("The payment window was closed. You have not been charged. You can try again below.") },
    });
    checkout.on("payment.failed", (r) => setNotice(r.error?.description ? `The payment did not go through: ${r.error.description}` : "The payment did not go through. You have not been charged."));
    checkout.open();
  }

  async function startPayment(appointmentId: string) {
    if (creatingFor) return;
    setCreatingFor(appointmentId);
    setResult(null);
    setNotice(null);
    try {
      const created = await paymentsApi.createOrder({ appointmentId });
      setOrder(created);
      if (!created.simulated && script === "ready") openCheckout(created);
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error(title, { description: detail });
    } finally {
      setCreatingFor(null);
    }
  }

  const fee = config.status === "ready" ? config.data.appointmentFeeRupees : null;
  const info = mode ? MODE_TEXT[mode] : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Pay consultation fees for confirmed appointments and keep your receipts." />

      {config.status === "error" ? (
        <ErrorState error={config.error} onRetry={config.reload} />
      ) : info ? (
        <Alert tone={info.tone}>
          <ShieldCheck className="size-4" aria-hidden="true" />
          <AlertTitle>{info.title}</AlertTitle>
          <AlertDescription>{info.body}</AlertDescription>
        </Alert>
      ) : null}

      {order ? (
        <section aria-labelledby="checkout-heading" className="bg-card space-y-4 rounded-xl border p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="checkout-heading" className="text-base font-semibold">Complete your payment</h2>
              <p className="text-muted-foreground text-xs">{order.hospitalName}, {formatDayLong(new Date(order.slotTime))} at {formatTime(new Date(order.slotTime))}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setOrder(null); setResult(null); setNotice(null); }} aria-label="Close payment panel">Close</Button>
          </div>

          <dl className="bg-muted/40 grid grid-cols-2 gap-2 rounded-md p-3 text-xs">
            <dt className="text-muted-foreground">Consultation fee</dt>
            <dd className="text-right text-base font-bold">₹{order.amountRupees}</dd>
            <dt className="text-muted-foreground">Order</dt>
            <dd className="text-right font-mono">{order.orderRef}</dd>
          </dl>

          {!result ? (
            <div className="space-y-3">
              {notice ? <p role="status" className="text-sm">{notice}</p> : null}
              {order.simulated ? (
                <div className="space-y-2 border-t pt-3">
                  <Badge tone="warning">Test only: no money moves</Badge>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void confirmWithServer({ orderRef: order.orderRef, simulate: "success" })} disabled={confirming}>Test: payment succeeds</Button>
                    <Button variant="outline" onClick={() => void confirmWithServer({ orderRef: order.orderRef, simulate: "failure" })} disabled={confirming}>Test: payment fails</Button>
                  </div>
                </div>
              ) : script === "failed" ? (
                <Alert tone="danger">
                  <AlertCircle className="size-4" aria-hidden="true" />
                  <AlertTitle>The payment window couldn&rsquo;t load</AlertTitle>
                  <AlertDescription>Razorpay&rsquo;s checkout was blocked or you are offline. Disable ad blockers for this site, check your connection and reload.</AlertDescription>
                </Alert>
              ) : (
                <Button onClick={() => openCheckout(order)} disabled={confirming || script !== "ready"} className="w-full sm:w-auto">
                  {confirming || script === "loading" ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CreditCard aria-hidden="true" />}
                  {script === "loading" ? "Loading payment window…" : confirming ? "Confirming with your bank…" : `Pay ₹${order.amountRupees} (UPI, card, net banking)`}
                </Button>
              )}
            </div>
          ) : (
            <div role="status" className="space-y-2 border-t pt-3 text-sm">
              {result.status === "completed" ? (
                <p className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-5" aria-hidden="true" /> Paid. Receipt {result.receiptNumber}</p>
              ) : result.status === "pending" ? (
                <p className="flex items-center gap-2 font-semibold"><Clock className="size-5" aria-hidden="true" /> Waiting for confirmation. This is not shown as paid yet.</p>
              ) : (
                <p className="text-destructive flex items-center gap-2 font-semibold"><XCircle className="size-5" aria-hidden="true" /> The payment failed.</p>
              )}
              {result.status === "failed" ? <Button size="sm" onClick={() => setResult(null)}>Try again</Button> : null}
            </div>
          )}
        </section>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Appointments you can pay for</h2>
        {appointments.status === "loading" ? (
          <LoadingState label="Loading appointments" rows={2} />
        ) : appointments.status === "error" ? (
          isNoPatientError(appointments.error) ? <NoPatientProfile /> : <ErrorState error={appointments.error} onRetry={appointments.reload} />
        ) : payable.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Nothing to pay right now"
            description="When you book an appointment, its consultation fee appears here."
            action={<Button asChild variant="outline" size="sm"><Link href="/hospitals">Find a hospital</Link></Button>}
          />
        ) : (
          <ul className="bg-card min-w-0 divide-y rounded-xl border shadow-[var(--shadow-soft)]">
            {payable.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">{a.hospitalName}</p>
                  <p className="text-muted-foreground text-xs">{formatDayLong(new Date(a.startsAt))} at {formatTime(new Date(a.startsAt))}</p>
                </div>
                <Button size="sm" onClick={() => void startPayment(a.id)} disabled={mode === "unavailable" || creatingFor !== null}>
                  {creatingFor === a.id ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CreditCard aria-hidden="true" />}
                  {fee ? `Pay ₹${fee}` : "Pay"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Payment history and receipts</h2>
        {history.status === "loading" ? (
          <LoadingState label="Loading payment history" rows={3} />
        ) : history.status === "error" ? (
          <ErrorState error={history.error} onRetry={history.reload} />
        ) : history.data.length === 0 ? (
          <EmptyState icon={Receipt} title="No payments yet" description="Receipts for paid appointments appear here." />
        ) : (
          <ul className="bg-card min-w-0 divide-y rounded-xl border shadow-[var(--shadow-soft)]">
            {history.data.map((item: PaymentHistoryItem) => (
              <li key={item.id} className="flex flex-col gap-2 p-4 text-xs sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{item.hospitalName}</span>
                    <Badge tone={item.status === "completed" ? "success" : item.status === "pending" ? "warning" : "danger"}>
                      {item.status === "completed" ? "Paid" : item.status === "pending" ? "Not paid yet" : item.status === "failed" ? "Failed" : item.status}
                    </Badge>
                    {item.simulated ? <Badge tone="neutral">Test only</Badge> : item.isSandbox ? <Badge tone="neutral">Sandbox</Badge> : null}
                  </div>
                  <p className="text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()} · Order <code className="text-foreground">{item.orderRef}</code></p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">₹{item.amountRupees}</p>
                  <p className="text-muted-foreground">{item.receiptNumber ? `Receipt ${item.receiptNumber}` : item.status === "pending" ? "Awaiting payment" : "No receipt"}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
