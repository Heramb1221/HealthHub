import { useState } from "react";
import { Alert } from "react-native";

import { consentApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { Consent } from "../api/types";
import { useResource } from "../hooks/useResource";
import { consentStatus, providerLabel, scopeLabel, sortConsents, type ConsentStatus } from "../lib/consents";
import { formatDateTime } from "../lib/format";
import { AppText, Badge, Banner, Button, Card, Field, Screen, Stack } from "../ui/components";
import { EmptyState, ErrorState, LoadingState } from "../ui/states";

const STATUS: Record<ConsentStatus, { label: string; tone: "success" | "neutral"; icon: "check-circle" | "clock" | "slash" }> = {
  active: { label: "Access active", tone: "success", icon: "check-circle" },
  expired: { label: "Expired", tone: "neutral", icon: "clock" },
  revoked: { label: "Revoked", tone: "neutral", icon: "slash" },
};

export function SharingScreen() {
  const res = useResource((signal) => consentApi.list(signal));
  const [updated, setUpdated] = useState<Record<string, Consent>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (res.loading) return <Screen><LoadingState label="Loading who can see your records…" /></Screen>;
  if (res.error && !res.data) return <Screen><ErrorState error={res.error} onRetry={res.reload} /></Screen>;

  const items = sortConsents((res.data?.items ?? []).map((c) => updated[c.id] ?? c));

  function confirmRevoke(c: Consent) {
    Alert.alert(
      "Stop sharing?",
      `${providerLabel(c.granteeUserId)} will no longer be able to view ${scopeLabel(c.resourceScope).toLowerCase()}. Anything already viewed stays in your access history.`,
      [
        { text: "Keep sharing", style: "cancel" },
        { text: "Revoke access", style: "destructive", onPress: () => void revoke(c) },
      ],
    );
  }

  async function revoke(c: Consent) {
    setBusy(c.id);
    setError(null);
    setNotice(null);
    try {
      const result = await consentApi.revoke(c.id);
      setUpdated((u) => ({ ...u, [c.id]: result })); // the server's response is what we show
      setNotice("Access revoked. It applies to future access immediately.");
    } catch (e) {
      const info = describeError(e);
      setError(`${info.title}. ${info.detail}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen refreshing={res.refreshing} onRefresh={() => { setUpdated({}); res.refresh(); }}>
      <Stack>
        <Banner tone="info" title="You control who can see your records" icon="shield">
          Providers can only see what you have shared, only while the access is active. Revoking stops future access and keeps the history.
          Giving access to a provider is not available in the mobile app yet.
        </Banner>
        {notice ? <Banner tone="success" title={notice} icon="check-circle" /> : null}
        {error ? <Banner tone="danger" title={error} icon="alert-circle" /> : null}
        {items.length === 0 ? (
          <EmptyState icon="lock" title="You haven't shared anything" body="When you give a provider access to part of your records, it will be listed here." />
        ) : (
          items.map((c) => {
            const status = consentStatus(c);
            const s = STATUS[status];
            return (
              <Card key={c.id}>
                <AppText variant="label">{scopeLabel(c.resourceScope)}</AppText>
                <Badge label={s.label} tone={s.tone} icon={s.icon} />
                <AppText variant="small" muted>{providerLabel(c.granteeUserId)}</AppText>
                <Field label="Purpose" value={c.purpose} />
                <Field label="Shared on" value={formatDateTime(c.createdAt)} />
                {status === "revoked" ? <Field label="Revoked on" value={formatDateTime(c.revokedAt)} /> : null}
                {status !== "revoked" ? <Field label="Expires" value={c.expiresAt ? formatDateTime(c.expiresAt) : "No expiry date"} /> : null}
                {status === "active" ? <Button label="Revoke access" variant="danger" icon="slash" onPress={() => confirmRevoke(c)} loading={busy === c.id} disabled={busy !== null && busy !== c.id} /> : null}
              </Card>
            );
          })
        )}
      </Stack>
    </Screen>
  );
}
