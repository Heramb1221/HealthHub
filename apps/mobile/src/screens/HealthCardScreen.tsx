import { useEffect, useState } from "react";
import QRCode from "react-native-qrcode-svg";
import { View } from "react-native";

import { patientApi, prescriptionApi, qrApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { QrLookup, QrSession } from "../api/types";
import { useResource } from "../hooks/useResource";
import { describeAccessEvent } from "../lib/access";
import { formatCountdown, formatDateOnly, formatDateTime, formatDateTime as fmt, orDash } from "../lib/format";
import { AppText, Banner, Button, Card, Chip, Field, Row, Screen, Stack } from "../ui/components";
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
  const [revoking, setRevoking] = useState(false);
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
  const c = card.data;
  if (!c) return null;

  const readable = (list.data?.items ?? []).filter((p) => p.processingStatus === "completed");
  const revoked = Boolean(session?.revokedAt);
  const expired = session ? new Date(session.expiresAt).getTime() <= now.getTime() : false;
  // BACKEND J3: the payload is a link with a random id; it is the only thing the QR code encodes.
  const payload = session ? session.qrPayload : null;

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

  async function revokeQr() {
    if (!session) return;
    setRevoking(true);
    setQrError(null);
    try {
      setSession(await qrApi.revokeSession(session.id));
      setLookup(null);
      void access.reload();
    } catch (error) {
      const info = describeError(error);
      setQrError(`${info.title}. ${info.detail}`);
    } finally {
      setRevoking(false);
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
          </Row>
          <AppText variant="title" color={colors.onPrimary} selectable>{orDash(c.healthId)}</AppText>
          <AppText color={colors.onPrimary}>{orDash(c.fullName)}</AppText>
          <Row style={{ gap: space.xl, flexWrap: "wrap" }}>
            <View><AppText variant="caption" color="#c9d6e4">Date of birth</AppText><AppText color={colors.onPrimary}>{formatDateOnly(c.dateOfBirth)}</AppText></View>
            <View><AppText variant="caption" color="#c9d6e4">Blood group</AppText><AppText color={colors.onPrimary}>{orDash(c.bloodGroup)}</AppText></View>
          </Row>
        </Card>
        <Card>
          <AppText variant="small" muted>
            {c.notice ?? "This is a HealthHub identifier. It is not an official or national health ID."}
          </AppText>
          <AppText variant="caption" muted>
            The card shows identity details only. Allergies, conditions and your emergency contact are in Profile.
            {c.generatedAt ? ` Generated ${formatDateTime(c.generatedAt)}.` : ""}
          </AppText>
        </Card>

        <AppText variant="heading" accessibilityRole="header">Share a prescription with a QR code</AppText>
        <AppText variant="small" muted>
          The QR code holds only a random link, never medical details. Scanning it gives no access by itself: a provider also needs your consent. It stops working when it expires or when you turn it off, and each use is recorded below.
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
            {revoked ? (
              <Banner tone="info" title="You turned this QR code off" icon="slash">It no longer works. Create a new one to share again.</Banner>
            ) : expired ? (
              <Banner tone="warning" title="This QR code has expired" icon="clock">Create a new one to share again.</Banner>
            ) : (
              <>
                <View accessible accessibilityLabel="QR code for the selected prescription" style={{ padding: space.md, backgroundColor: "#fff" }}>
                  <QRCode value={payload} size={200} />
                </View>
                <AppText variant="small" muted>Expires in {formatCountdown(session.expiresAt, now)} ({fmt(session.expiresAt)})</AppText>
                <Button label="Check what this QR shows" variant="secondary" icon="eye" onPress={() => void checkLookup()} loading={lookupBusy} disabled={revoking} />
                <Button label="Turn this QR code off" variant="danger" icon="slash" onPress={() => void revokeQr()} loading={revoking} disabled={lookupBusy} />
              </>
            )}
            {lookupError ? <Banner tone="danger" title={lookupError} icon="alert-circle" /> : null}
            {lookup && !expired && !revoked ? (
              <AppText variant="small" accessibilityLiveRegion="polite">
                QR is active. A permitted reader would see this prescription as it is now ({lookup.prescription.medications.length} medicine(s)) with its review status, and nothing from your profile.
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
              <Field key={e.id} label={formatDateTime(e.occurredAt)} value={describeAccessEvent(e).text} />
            ))}
          </Card>
        )}
      </Stack>
    </Screen>
  );
}
