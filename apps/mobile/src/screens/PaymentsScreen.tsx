import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { appointmentApi, paymentApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { Appointment, PaymentHistoryItem, PaymentOrder, PaymentVerificationResult } from "../api/types";
import { useResource } from "../hooks/useResource";
import { formatDateTime } from "../lib/format";
import { AppText, Badge, Banner, Button, Card, Heading, Row, Screen, Stack } from "../ui/components";
import { EmptyState, ErrorState, LoadingState } from "../ui/states";
import { colors, radius, space } from "../ui/theme";

export function PaymentsScreen() {
  const appointmentsRes = useResource((signal) => appointmentApi.list(signal));
  const historyRes = useResource((signal) => paymentApi.listHistory(signal));

  const [activeOrder, setActiveOrder] = useState<PaymentOrder | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifiedResult, setVerifiedResult] = useState<PaymentVerificationResult | null>(null);

  async function handleStartPayment(appointmentId: string) {
    setCreating(appointmentId);
    try {
      const order = await paymentApi.createOrder({
        appointmentId,
        amountPaise: 50000, // ₹500
        currency: "INR",
      });
      setActiveOrder(order);
      setVerifiedResult(null);
    } catch (e) {
      const info = describeError(e);
      Alert.alert("Error", `${info.title}. ${info.detail}`);
    } finally {
      setCreating(null);
    }
  }

  async function handleVerify(simulateFailure = false) {
    if (!activeOrder) return;
    setVerifying(true);
    try {
      const res = await paymentApi.verifyPayment({
        orderRef: activeOrder.orderRef,
        paymentRef: simulateFailure ? undefined : `pay_demo_${Date.now()}`,
        simulateFailure,
      });
      setVerifiedResult(res);
      if (res.status === "completed") {
        Alert.alert("Payment Success", `Consultation fee paid! Receipt: ${res.receiptNumber}`);
      } else {
        Alert.alert("Payment Failed", "Transaction simulation failed. Try again.");
      }
      await historyRes.reload();
    } catch (e) {
      const info = describeError(e);
      Alert.alert("Error", `${info.title}. ${info.detail}`);
    } finally {
      setVerifying(false);
    }
  }

  const appointments = appointmentsRes.data?.items ?? [];
  const history = historyRes.data?.items ?? [];

  const paidAppointmentTimes = new Set(
    history.filter((h) => h.status === "completed").map((h) => h.appointmentTime)
  );

  const pendingAppointments = appointments.filter(
    (a) => a.status === "confirmed" && !paidAppointmentTimes.has(a.startsAt)
  );

  return (
    <Screen refreshing={appointmentsRes.refreshing || historyRes.refreshing} onRefresh={() => { appointmentsRes.refresh(); historyRes.refresh(); }}>
      <Stack gap={space.lg}>
        <Banner tone="neutral" title="Sandbox Payment Simulator" icon="shield">
          Payments are processed in sandbox test mode. No real debit/credit cards or bank accounts will be charged.
        </Banner>

        {/* Active Checkout Card */}
        {activeOrder ? (
          <Card style={styles.checkoutCard}>
            <Heading level={2}>Pay Consultation Fee</Heading>
            <View style={styles.checkoutBox}>
              <Row style={styles.detailRow}>
                <AppText variant="small" muted>
                  Hospital:
                </AppText>
                <AppText variant="small" style={{ fontWeight: "600" }}>
                  {activeOrder.hospitalName}
                </AppText>
              </Row>
              <Row style={styles.detailRow}>
                <AppText variant="small" muted>
                  Order Ref:
                </AppText>
                <AppText variant="small" style={{ fontFamily: "monospace" }}>
                  {activeOrder.orderRef}
                </AppText>
              </Row>
              <Row style={styles.detailRow}>
                <AppText variant="small" muted>
                  Amount:
                </AppText>
                <AppText variant="label" style={{ color: colors.success, fontSize: 16 }}>
                  ₹{activeOrder.amountRupees} {activeOrder.currency}
                </AppText>
              </Row>
            </View>

            {!verifiedResult ? (
              <Row style={{ gap: space.sm, marginTop: space.sm }}>
                <Button
                  label="Simulate Failure"
                  variant="danger"
                  onPress={() => void handleVerify(true)}
                  disabled={verifying}
                  style={{ flex: 1 }}
                />
                <Button
                  label={verifying ? "Processing…" : `Pay ₹${activeOrder.amountRupees}`}
                  variant="primary"
                  onPress={() => void handleVerify(false)}
                  loading={verifying}
                  style={{ flex: 1 }}
                />
              </Row>
            ) : (
              <View style={{ marginTop: space.sm }}>
                <Banner
                  tone={verifiedResult.status === "completed" ? "success" : "danger"}
                  title={verifiedResult.status === "completed" ? "Payment Completed" : "Payment Failed"}
                  icon={verifiedResult.status === "completed" ? "check-circle" : "alert-circle"}
                >
                  {verifiedResult.status === "completed"
                    ? `Receipt: ${verifiedResult.receiptNumber}\nAmount: ₹${verifiedResult.amountRupees}`
                    : "Simulated decline or failure."}
                </Banner>
                <Button
                  label="Done"
                  variant="secondary"
                  onPress={() => setActiveOrder(null)}
                  style={{ marginTop: space.sm }}
                />
              </View>
            )}
          </Card>
        ) : null}

        {/* Pending Consultation Payments */}
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
                  label={creating === a.id ? "Creating…" : "Pay ₹500"}
                  variant="primary"
                  icon="credit-card"
                  onPress={() => void handleStartPayment(a.id)}
                  loading={creating === a.id}
                  style={{ minHeight: 38, paddingVertical: 8, paddingHorizontal: 16 }}
                />
              </Row>
            </Card>
          ))
        )}

        {/* Payment History */}
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
