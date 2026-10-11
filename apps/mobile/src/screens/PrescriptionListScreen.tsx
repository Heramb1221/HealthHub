import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";

import { prescriptionApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { Prescription } from "../api/types";
import { useResource } from "../hooks/useResource";
import { formatDateOnly, formatDateTime } from "../lib/format";
import { PROCESSING_STATUS, VERIFICATION_STATUS } from "../lib/status";
import type { RootStackParamList } from "../navigation/types";
import { AppText, Badge, Banner, Button, Card, Screen, Stack } from "../ui/components";
import { EmptyState, ErrorState, LoadingState } from "../ui/states";
import { Pressable } from "react-native";

export function PrescriptionListScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const res = useResource((signal) => prescriptionApi.list(signal));
  const [more, setMore] = useState<Prescription[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const nextCursor = cursor === undefined ? (res.data?.nextCursor ?? null) : cursor;

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await prescriptionApi.list(undefined, nextCursor);
      setMore((m) => [...m, ...page.items]);
      setCursor(page.nextCursor);
    } catch (error) {
      const info = describeError(error);
      setMoreError(`${info.title}. ${info.detail}`);
    } finally {
      setLoadingMore(false);
    }
  }

  function refresh() {
    setMore([]);
    setCursor(undefined);
    res.refresh();
  }

  if (res.loading) return <Screen><LoadingState label="Loading prescriptions…" /></Screen>;
  if (res.error && !res.data) return <Screen><ErrorState error={res.error} onRetry={res.reload} /></Screen>;

  const items = [...(res.data?.items ?? []), ...more];

  return (
    <Screen refreshing={res.refreshing} onRefresh={refresh}>
      <Stack>
        <Button label="Upload a prescription" icon="upload" onPress={() => nav.navigate("PrescriptionUpload")} />
        {items.length === 0 ? (
          <EmptyState
            icon="file-text"
            title="No prescriptions yet"
            body="Upload a clear photo or PDF of a paper prescription. You'll review what was read before relying on it."
          />
        ) : (
          items.map((p) => {
            const proc = PROCESSING_STATUS[p.processingStatus];
            const ver = VERIFICATION_STATUS[p.verificationStatus];
            const names = p.medications.map((m) => m.name).filter(Boolean).join(", ");
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`Prescription from ${formatDateOnly(p.prescriptionDate ?? p.createdAt)}. ${proc.label}. ${ver.label}.`}
                onPress={() => nav.navigate("PrescriptionDetail", { id: p.id })}
              >
                <Card>
                  <AppText variant="label">{p.prescriptionDate ? formatDateOnly(p.prescriptionDate) : `Uploaded ${formatDateTime(p.createdAt)}`}</AppText>
                  {p.prescriberName ? <AppText variant="small" muted>{p.prescriberName}</AppText> : null}
                  <AppText variant="small" muted numberOfLines={2}>
                    {names || (p.processingStatus === "completed" ? "No medicines were read from this file." : "Details not available yet.")}
                  </AppText>
                  <Stack gap={4}>
                    <Badge label={proc.label} tone={proc.tone} icon={proc.icon as never} />
                    <Badge label={ver.label} tone={ver.tone} icon={ver.icon as never} />
                  </Stack>
                </Card>
              </Pressable>
            );
          })
        )}
        {moreError ? <Banner tone="danger" title={moreError} icon="alert-circle" /> : null}
        {nextCursor ? <Button label="Load more" variant="secondary" onPress={() => void loadMore()} loading={loadingMore} /> : null}
      </Stack>
    </Screen>
  );
}
