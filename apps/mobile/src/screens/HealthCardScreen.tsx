import { useEffect, useState } from "react";
import QRCode from "react-native-qrcode-svg";
import { View } from "react-native";

import { patientApi, prescriptionApi, qrApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { QrLookup, QrSession } from "../api/types";
import { useResource } from "../hooks/useResource";
import { formatCountdown, formatDateOnly, formatDateTime, formatDateTime as fmt, orDash } from "../lib/format";
import { AppText, Banner, Button, Card, Chip, DemoTag, Field, Row, Screen, Stack } from "../ui/components";
import { ErrorState, LoadingState } from "../ui/states";
import { colors, space } from "../ui/theme";

export function HealthCardScreen() {
  const card = useResource((signal) => patientApi.healthCard(signal));
  const list = useResource((signal) => prescriptionApi.list(signal));
  const access = useResource((signal) => patientApi.accessHistory(signal));

  const [selected, setSelected] = useState<string | null>(null);
  const [session, setSession] = useState<QrSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<QrLookup | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Tick so the expiry countdown and expired state stay honest.
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, [session]);

  if (card.loading) return <Screen><LoadingState label="Loading your health card…" /></Screen>;
  if (card.error && !card.data) return <Screen><ErrorState error={card.error} onRetry={card.reload} /></Screen>;
  const c = card.data ?? {};

  const readable = (list.data?.items ?? []).filter((p) => p.processingStatus === "completed");
  const expired = session ? new Date(session.expiresAt).getTime() <= now.getTime() : false;
  const payload = session ? (session.url ?? session.reference ?? session.id) : null;

  async function createQr() {
    if (!selected) return;
    setCreating(true);
    setQrError(null);
    setLookup(null);
    setLookupError(null);
    try {
      setSession(await qrApi.createSession({ prescriptionId: selected }));
      setNow(new Date());
      void access.reload();
    } catch (error) {
      const info = describeError(error);
      setQrError(`${info.title}. ${info.detail}`);
    } finally {
      setCreating(false);
    }
  }

  async function checkLookup() {
    if (!session) return;
    setLookupBusy(true);
    setLookupError(null);
    try {
      setLookup(await qrApi.getSession(session.id));
      void access.reload();
    } catch (error) {
      const info = describeError(error);
      setLookupError(info.title === "Not found" ? "This QR has expired or was revoked." : `${info.title}. ${info.detail}`);
    } finally {
      setLookupBusy(false);
    }
  }

  return (
    <Screen refreshing={card.refreshing} onRefresh={() => { card.refresh(); access.reload(); }}>
      <Stack>
        <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary }} >
          <Row style={{ justifyContent: "space-between" }}>
            <AppText variant="caption" color="#c9d6e4">HEALTHHUB HEALTH CARD</AppText>
            {c.demo ? <DemoTag /> : null}
          </Row>
          <AppText variant="title" color={colors.onPrimary} selectable>{orDash(c.healthId)}</AppText>
          <AppText color={colors.onPrimary}>{orDash(c.fullName)}</AppText>
          <Row style={{ gap: space.xl, flexWrap: "wrap" }}>
            <View><AppText variant="caption" color="#c9d6e4">Date of birth</AppText><AppText color={colors.onPrimary}>{formatDateOnly(c.dateOfBirth)}</AppText></View>
            <View><AppText variant="caption" color="#c9d6e4">Blood group</AppText><AppText color={colors.onPrimary}>{orDash(c.bloodGroup)}</AppText></View>
          </Row>
        </Card>
        <Card>
          <Field label="Emergency contact" value={[c.emergencyContactName, c.emergencyContactPhone].filter(Boolean).join(" · ") || "Not provided"} />
          <Field label="Allergies (self-reported)" value={c.allergies?.length ? c.allergies.join(", ") : "None listed"} />
          <AppText variant="caption" muted>This card shows details you entered. It is not an official or national health ID.</AppText>
        </Card>

        <AppText variant="heading" accessibilityRole="header">Share a prescription with a QR code</AppText>
        <AppText variant="small" muted>
          The QR code holds only a random reference, never medical details. It stops working when it expires, and each lookup is recorded below.
        </AppText>
        {list.loading ? (
          <AppText muted>Loading prescriptions…</AppText>
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : readable.length === 0 ? (
          <Banner tone="info" title="No prescriptions ready to share" icon="info">Upload a prescription and wait for it to finish reading.</Banner>
        ) : (
          <Stack gap={space.sm}>
            <AppText variant="label">Choose a prescription</AppText>
            <Row style={{ flexWrap: "wrap" }}>
              {readable.map((p) => (
                <Chip key={p.id} label={formatDateOnly(p.prescriptionDate ?? p.createdAt)} selected={selected === p.id} onPress={() => { setSelected(p.id); setSession(null); setLookup(null); }} />
              ))}
            </Row>
            <Button label="Create QR code" icon="grid" onPress={() => void createQr()} loading={creating} disabled={!selected} />
          </Stack>
        )}
        {qrError ? <Banner tone="danger" title={qrError} icon="alert-circle" /> : null}

        {session && payload ? (
          <Card style={{ alignItems: "center" }}>
            {expired ? (
              <Banner tone="warning" title="This QR code has expired" icon="clock">Create a new one to share again.</Banner>
            ) : (
              <>
                <View accessible accessibilityLabel="QR code for the selected prescription" style={{ padding: space.md, backgroundColor: "#fff" }}>
                  <QRCode value={payload} size={200} />
                </View>
                <AppText variant="small" muted>Expires in {formatCountdown(session.expiresAt, now)} ({fmt(session.expiresAt)})</AppText>
                <Button label="Check what this QR shows" variant="secondary" icon="eye" onPress={() => void checkLookup()} loading={lookupBusy} />
              </>
            )}
            {lookupError ? <Banner tone="danger" title={lookupError} icon="alert-circle" /> : null}
            {lookup && !expired ? (
              <AppText variant="small" accessibilityLiveRegion="polite">
                QR is active{lookup.prescription?.medications ? ` and would show ${lookup.prescription.medications.length} medicine(s)` : ""}.
              </AppText>
            ) : null}
          </Card>
        ) : null}

        <AppText variant="heading" accessibilityRole="header">Who looked at your records</AppText>
        {access.loading ? (
          <AppText muted>Loading access history…</AppText>
        ) : access.error ? (
          <ErrorState error={access.error} onRetry={access.reload} />
        ) : (access.data?.items.length ?? 0) === 0 ? (
          <AppText muted>No access events recorded.</AppText>
        ) : (
          <Card>
            {access.data?.items.map((e) => (
              <Field key={e.id} label={formatDateTime(e.occurredAt)} value={`${e.action.replace(/[._]/g, " ")}${e.outcome ? ` · ${e.outcome}` : ""}`} />
            ))}
          </Card>
        )}
      </Stack>
    </Screen>
  );
}
