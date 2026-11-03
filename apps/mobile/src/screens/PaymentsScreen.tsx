import { useState } from "react";
import { Alert, Linking, StyleSheet, View } from "react-native";

import { appointmentApi, paymentApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { Appointment, PaymentHistoryItem, PaymentOrder, PaymentVerificationResult } from "../api/types";
import { WEB_APP_URL } from "../config";
import { useResource } from "../hooks/useResource";
import { formatDateTime } from "../lib/format";
import { AppText, Badge, Banner, Button, Card, Heading, Row, Screen, Stack } from "../ui/components";
import { EmptyState, ErrorState, LoadingState } from "../ui/states";
import { colors, radius, space } from "../ui/theme";

export function PaymentsScreen() {
  const configRes = useResource((signal) => paymentApi.getConfig(signal));
  const appointmentsRes = useResource((signal) => appointmentApi.list(signal));
  const historyRes = useResource((signal) => paymentApi.listHistory(signal));

  const [activeOrder, setActiveOrder] = useState<PaymentOrder | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifiedResult, setVerifiedResult] = useState<PaymentVerificationResult | null>(null);

  const mode = configRes.data?.mode ?? null;
  const fee = configRes.data?.appointmentFeeRupees ?? null;

  async function handleStartPayment(appointmentId: string) {
    if (creating) return;
    if (mode === "razorpay_test" || mode === "razorpay_live") {
      // This app has no payment SDK, so it never pretends to take payment. Real payments use the secure web checkout,
      // where Razorpay confirms the money with the server; this screen then shows the confirmed result.
      void Linking.openURL(`${WEB_APP_URL}/payments`).catch(() => Alert.alert("Couldn't open the browser", `Open ${WEB_APP_URL}/payments yourself to pay.`));
      return;
    }
    setCreating(appointmentId);
    try {
      const order = await paymentApi.createOrder({ appointmentId });
      setActiveOrder(order);
      setVerifiedResult(null);
    } catch (e) {
      const info = describeError(e);
      Alert.alert(info.title, info.detail);
    } finally {
      setCreating(null);
    }
  }

  async function handleSimulate(outcome: "success" | "failure") {
    if (!activeOrder || verifying) return;
    setVerifying(true);
    try {
      // Only simulated development orders accept this; the server refuses it for real orders and in production.
      const res = await paymentApi.verifyPayment({ orderRef: activeOrder.orderRef, simulate: outcome });
      setVerifiedResult(res);
      await historyRes.reload();
    } catch (e) {
      const info = describeError(e);
      Alert.alert(info.title, info.detail);
    } finally {
      setVerifying(false);
    }
  }

  const appointments = appointmentsRes.data?.items ?? [];
  const history = historyRes.data?.items ?? [];
  const paidAppointmentIds = new Set(history.filter((h) => h.status === "completed").map((h) => h.appointmentId));
  const pendingAppointments = appointments.filter((a) => a.status === "confirmed" && new Date(a.startsAt) > new Date() && !paidAppointmentIds.has(a.id));

  const banner =
    mode === "razorpay_live"
      ? { tone: "success" as const, title: "Pay securely on the website", text: "Cards, UPI and net banking are handled by Razorpay on the website. Pull down here afterwards to see your receipt." }
      : mode === "razorpay_test"
        ? { tone: "neutral" as const, title: "Test payments (sandbox)", text: "Payments are made on the website using Razorpay test cards. No real money moves. Pull down here afterwards to see the result." }
        : mode === "simulated"
          ? { tone: "neutral" as const, title: "Development test payments", text: "No payment gateway is connected. Outcomes here are simulated and no money moves." }
          : mode === "unavailable"
            ? { tone: "neutral" as const, title: "Online payment isn't available yet", text: "Please pay at the hospital for now." }
            : null;

  return (
    <Screen refreshing={appointmentsRes.refreshing || historyRes.refreshing} onRefresh={() => { appointmentsRes.refresh(); historyRes.refresh(); configRes.refresh(); }}>
      <Stack gap={space.lg}>
        {banner ? <Banner tone={banner.tone} title={banner.title} icon="shield">{banner.text}</Banner> : null}

        {activeOrder ? (
          <Card style={styles.checkoutCard}>
            <Heading level={2}>Test payment</Heading>
            <View style={styles.checkoutBox}>
              <Row style={styles.detailRow}>
                <AppText variant="small" muted>Hospital:</AppText>
                <AppText variant="small" style={{ fontWeight: "600" }}>{activeOrder.hospitalName}</AppText>
              </Row>
              <Row style={styles.detailRow}>
                <AppText variant="small" muted>Amount:</AppText>
                <AppText variant="label" style={{ color: colors.success, fontSize: 16 }}>₹{activeOrder.amountRupees} {activeOrder.currency}</AppText>
              </Row>
            </View>
            {!verifiedResult ? (
              <View style={{ gap: space.sm, marginTop: space.sm }}>
                <Badge label="Test only: no money moves" tone="warning" />
                <Row style={{ gap: space.sm }}>
                  <Button label="Test: fails" variant="danger" onPress={() => void handleSimulate("failure")} disabled={verifying} style={{ flex: 1 }} />
                  <Button label={verifying ? "Working…" : "Test: succeeds"} variant="primary" onPress={() => void handleSimulate("success")} loading={verifying} style={{ flex: 1 }} />
                </Row>
              </View>
            ) : (
              <View style={{ marginTop: space.sm }}>
                <Banner
                  tone={verifiedResult.status === "completed" ? "success" : verifiedResult.status === "pending" ? "warning" : "danger"}
                  title={verifiedResult.status === "completed" ? "Test payment recorded" : verifiedResult.status === "pending" ? "Waiting for confirmation" : "Test payment failed"}
                  icon={verifiedResult.status === "completed" ? "check-circle" : "alert-circle"}
                >
                  {verifiedResult.status === "completed" ? `Receipt ${verifiedResult.receiptNumber}. Amount ₹${verifiedResult.amountRupees}` : "No money moved."}
                </Banner>
                <Button label="Done" variant="secondary" onPress={() => setActiveOrder(null)} style={{ marginTop: space.sm }} />
              </View>
            )}
          </Card>
        ) : null}

        <Heading level={2}>Pending Consultation Fees ({pendingAppointments.length})</Heading>
        {appointmentsRes.loading ? (
          <LoadingState label="Loading booked appointments…" />
        ) : pendingAppointments.length === 0 ? (
          <Card>
            <AppText variant="small" muted>
              No consultation fees are pending payment for your confirmed appointments.
            </AppText>
          </Card>
        ) : (
          pendingAppointments.map((a: Appointment) => (
            <Card key={a.id}>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="heading">{a.hospital?.name ?? "Hospital Consultation"}</AppText>
                  <AppText variant="small" muted>
                    {a.startsAt ? formatDateTime(a.startsAt) : "Appointment"}
                  </AppText>
                </View>
                <Badge label="Due" tone="warning" />
              </Row>

              <Row style={{ justifyContent: "space-between", alignItems: "center", marginTop: space.sm }}>
                <AppText variant="label" style={{ color: colors.text }}>
                  Fee: ₹500.00
                </AppText>
                <Button
                  label={creating === a.id ? "Preparing…" : mode === "unavailable" ? "Pay at hospital" : fee ? `Pay ₹${fee}` : "Pay"}
                  variant="primary"
                  icon="credit-card"
                  onPress={() => void handleStartPayment(a.id)}
                  disabled={mode === "unavailable"}
                  loading={creating === a.id}
                  style={{ paddingHorizontal: space.lg }}
                />
              </Row>
            </Card>
          ))
        )}

        <Heading level={2}>Payment History & Receipts</Heading>
        {historyRes.loading ? (
          <LoadingState label="Loading payment history…" />
        ) : historyRes.error && !historyRes.data ? (
          <ErrorState error={historyRes.error} onRetry={historyRes.reload} />
        ) : history.length === 0 ? (
          <EmptyState
            icon="file-text"
            title="No payment transactions yet"
            body="When you pay for doctor appointments or clinical consultations, your digital receipts will appear here."
          />
        ) : (
          history.map((item: PaymentHistoryItem) => {
            const isSuccess = item.status === "completed";
            return (
              <Card key={item.id}>
                <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">{item.hospitalName}</AppText>
                    <AppText variant="small" muted style={{ fontFamily: "monospace" }}>
                      Order: {item.orderRef}
                    </AppText>
                  </View>
                  <Badge label={isSuccess ? "Paid" : item.status.toUpperCase()} tone={isSuccess ? "success" : "danger"} />
                </Row>

                <Row style={styles.detailRow}>
                  <AppText variant="small" muted>
                    Amount:
                  </AppText>
                  <AppText variant="label" style={{ color: isSuccess ? colors.success : colors.danger }}>
                    ₹{item.amountRupees} {item.currency}
                  </AppText>
                </Row>

                {isSuccess ? (
                  <Row style={styles.detailRow}>
                    <AppText variant="small" muted>
                      Receipt:
                    </AppText>
                    <AppText variant="small" style={{ fontWeight: "600" }}>
                      RCP-{item.orderRef.slice(-6).toUpperCase()}
                    </AppText>
                  </Row>
                ) : null}

                <Row style={styles.detailRow}>
                  <AppText variant="small" muted>
                    Date:
                  </AppText>
                  <AppText variant="small">{new Date(item.createdAt).toLocaleDateString()}</AppText>
                </Row>
              </Card>
            );
          })
        )}
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  checkoutCard: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  checkoutBox: {
    marginTop: space.sm,
    padding: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
});
