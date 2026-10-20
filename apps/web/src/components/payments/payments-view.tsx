"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  LoaderCircle,
  Receipt,
  ShieldCheck,
  Smartphone,
  XCircle,
} from "lucide-react";
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
import type { Appointment, PaymentHistoryItem, PaymentOrder, PaymentVerificationResult } from "@/lib/api/types";
import { formatDayLong, formatTime } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

export function PaymentsView() {
  const appointmentsResource = useResource(() => appointmentsApi.list(), "appointments");
  const historyResource = useResource(() => paymentsApi.listHistory(), "payment-history");

  const [activeCheckoutOrder, setActiveCheckoutOrder] = React.useState<PaymentOrder | null>(null);
  const [creatingOrderId, setCreatingOrderId] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [verificationResult, setVerificationResult] = React.useState<PaymentVerificationResult | null>(null);

  React.useEffect(() => {
    if (typeof window !== "undefined" && !document.getElementById("razorpay-checkout-js")) {
      const script = document.createElement("script");
      script.id = "razorpay-checkout-js";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  async function handleStartPayment(appointmentId: string) {
    setCreatingOrderId(appointmentId);
    try {
      const order = await paymentsApi.createOrder({
        appointmentId,
        amountPaise: 50000,
        currency: "INR",
      });
      setActiveCheckoutOrder(order);
      setVerificationResult(null);
      toast.success("Razorpay payment order generated.");

      if (order.orderRef.startsWith("order_") && !order.orderRef.startsWith("order_demo_")) {
        openRazorpayCheckout(order);
      }
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error(title, { description: detail });
    } finally {
      setCreatingOrderId(null);
    }
  }

  function openRazorpayCheckout(order: PaymentOrder) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window === "undefined" || !(window as any).Razorpay) {
      toast.info("Razorpay modal loading... If it doesn't open in a moment, use manual checkout below.");
      return;
    }

    const key = order.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_TpROXdDv4a0i9G";

    const options = {
      key,
      amount: order.amountPaise,
      currency: order.currency,
      name: "HealthHub Healthcare",
      description: `Consultation Fee at ${order.hospitalName}`,
      order_id: order.orderRef,
      prefill: {
        name: order.patientName || "Valued Patient",
        contact: order.patientPhone || "",
      },
      theme: {
        color: "#12355b",
      },
      handler: async function (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) {
        setVerifying(true);
        try {
          const res = await paymentsApi.verifyPayment({
            orderRef: response.razorpay_order_id,
            paymentRef: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          setVerificationResult(res);
          toast.success("Razorpay payment verified & receipt generated!");
          await historyResource.reload();
        } catch (err) {
          const { title, detail } = describeError(err);
          toast.error(title, { description: detail });
        } finally {
          setVerifying(false);
        }
      },
      modal: {
        ondismiss: function () {
          toast.info("Razorpay checkout was dismissed.");
        },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  }

  async function handleVerifySimulated(simulateFailure = false) {
    if (!activeCheckoutOrder) return;
    setVerifying(true);
    try {
      const res = await paymentsApi.verifyPayment({
        orderRef: activeCheckoutOrder.orderRef,
        paymentRef: simulateFailure ? undefined : `pay_demo_${Date.now()}`,
        simulateFailure,
      });
      setVerificationResult(res);
      if (res.status === "completed") {
        toast.success("Payment completed! Receipt generated.");
      } else {
        toast.error("Payment failed (simulated).");
      }
      await historyResource.reload();
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error(title, { description: detail });
    } finally {
      setVerifying(false);
    }
  }

  if (appointmentsResource.status === "error" && isNoPatientError(appointmentsResource.error)) {
    return <NoPatientProfile />;
  }

  const appointments: Appointment[] = appointmentsResource.status === "ready" ? appointmentsResource.data : [];
  const history: PaymentHistoryItem[] = historyResource.status === "ready" ? historyResource.data : [];

  const paidAppointmentTimes = new Set(
    history.filter((h: PaymentHistoryItem) => h.status === "completed").map((h: PaymentHistoryItem) => h.appointmentTime)
  );

  const pendingPaymentAppointments = appointments.filter(
    (a: Appointment) => a.status === "booked" && a.startsAt && !paidAppointmentTimes.has(a.startsAt)
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Consultation Payments & Invoices"
        description="Pay hospital consultation fees securely via Razorpay (UPI, NetBanking, Cards) and download digital receipts."
      />

      <Alert tone="neutral">
        <ShieldCheck className="size-4 text-primary" />
        <AlertTitle>Razorpay Payment Gateway Connected</AlertTitle>
        <AlertDescription className="text-xs">
          Razorpay test mode is active with key <code className="font-mono text-foreground">rzp_test_TpROXdDv4a0i9G</code>.
          You can test real UPI apps (GPay, PhonePe QR), Cards, or simulate sandbox responses.
        </AlertDescription>
      </Alert>

      {activeCheckoutOrder && (
        <div className="bg-card border-primary/40 space-y-4 rounded-lg border-2 p-6 shadow-md">
          <div className="flex items-start justify-between border-b pb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge tone="info" className="text-xs">
                  Razorpay Checkout
                </Badge>
                {activeCheckoutOrder.isSandbox && <Badge tone="warning">Test Mode</Badge>}
              </div>
              <h2 className="text-lg font-bold">Pay Hospital Consultation Fee</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setActiveCheckoutOrder(null)}>
              ✕
            </Button>
          </div>

          {!verificationResult ? (
            <div className="space-y-4">
              <div className="bg-muted/40 rounded-md p-4 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hospital / Clinic:</span>
                  <span className="font-semibold text-foreground">{activeCheckoutOrder.hospitalName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Razorpay Order ID:</span>
                  <span className="font-mono">{activeCheckoutOrder.orderRef}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Consultation Fee:</span>
                  <span className="text-base font-bold text-foreground">
                    ₹{activeCheckoutOrder.amountRupees} {activeCheckoutOrder.currency}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-2 border-t">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleVerifySimulated(true)}
                    disabled={verifying}
                    className="text-destructive hover:bg-destructive/10 text-xs"
                  >
                    <XCircle className="size-3.5" /> Simulate Failure
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleVerifySimulated(false)}
                    disabled={verifying}
                    className="text-xs"
                  >
                    Simulate Success
                  </Button>
                </div>

                <Button
                  onClick={() => openRazorpayCheckout(activeCheckoutOrder)}
                  disabled={verifying}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  {verifying ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Smartphone className="size-4" />
                  )}
                  Open Razorpay Modal (UPI / Card)
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {verificationResult.status === "completed" ? (
                <div className="border-emerald-500 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 rounded-md border p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-5 text-emerald-600" />
                    <h3 className="font-semibold text-sm">Payment Verified & Completed</h3>
                  </div>
                  <div className="text-xs space-y-1">
                    <p>Receipt Number: <strong>{verificationResult.receiptNumber}</strong></p>
                    <p>Amount Paid: ₹{verificationResult.amountRupees}</p>
                    <p>Payment Ref: {verificationResult.paymentRef}</p>
                    {verificationResult.verifiedAt && (
                      <p className="text-[11px] text-muted-foreground">Verified at: {new Date(verificationResult.verifiedAt).toLocaleString()}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border-destructive bg-destructive/10 text-destructive rounded-md border p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="size-5" />
                    <h3 className="font-semibold text-sm">Payment Failed / Declined</h3>
                  </div>
                  <p className="text-xs">The transaction could not be processed. Please retry with an alternate payment method.</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setActiveCheckoutOrder(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Unpaid Consultation Appointments ({pendingPaymentAppointments.length})</h2>
          <Link href="/appointments" className="text-primary text-xs hover:underline">
            View all appointments →
          </Link>
        </div>

        {appointmentsResource.status === "loading" ? (
          <LoadingState label="Loading booked appointments" rows={2} />
        ) : pendingPaymentAppointments.length === 0 ? (
          <div className="border-border bg-card rounded-md border p-4 text-xs text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
            <span>All upcoming appointments have consultation fees settled or no pending fee orders exist.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pendingPaymentAppointments.map((a: Appointment) => {
              const start = new Date(a.startsAt);
              return (
                <div key={a.id} className="bg-card border-border flex flex-col justify-between rounded-lg border p-4 shadow-xs">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <h3 className="text-sm font-semibold text-foreground">{a.hospitalName}</h3>
                      <Badge tone="warning">Payment Due</Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {formatDayLong(start)}, {formatTime(start)}
                    </p>
                    <p className="text-xs font-medium">Standard Consultation: ₹500.00</p>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => handleStartPayment(a.id)}
                      disabled={creatingOrderId === a.id}
                    >
                      {creatingOrderId === a.id ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <CreditCard className="size-3.5" />
                      )}
                      Pay ₹500 via Razorpay
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4 pt-4">
        <h2 className="text-base font-semibold">Payment History & Receipts</h2>

        {historyResource.status === "loading" ? (
          <LoadingState label="Loading payment history" rows={3} />
        ) : historyResource.status === "error" ? (
          <ErrorState error={historyResource.error} onRetry={historyResource.reload} />
        ) : history.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No payment transactions recorded"
            description="When you pay for doctor appointments or clinical services, your receipts and order histories appear here."
          />
        ) : (
          <div className="bg-card border-border divide-border divide-y rounded-lg border shadow-xs">
            {history.map((item: PaymentHistoryItem) => {
              const isSuccess = item.status === "completed";
              return (
                <div key={item.id} className="flex flex-col gap-2 p-4 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{item.hospitalName}</span>
                      <Badge tone={isSuccess ? "success" : "danger"}>
                        {isSuccess ? "Paid" : item.status.toUpperCase()}
                      </Badge>
                      {item.isSandbox && <Badge tone="neutral">Test Mode</Badge>}
                    </div>
                    <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                      <span>Order: <code className="text-foreground">{item.orderRef}</code></span>
                      {item.paymentRef && <span>Payment Ref: <code className="text-foreground">{item.paymentRef}</code></span>}
                      <span>Date: {new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-bold text-sm text-foreground">
                      ₹{item.amountRupees} {item.currency}
                    </span>
                    <p className="text-muted-foreground text-[11px]">
                      {isSuccess ? `Receipt: RCP-${item.orderRef.slice(-6).toUpperCase()}` : "Declined"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
