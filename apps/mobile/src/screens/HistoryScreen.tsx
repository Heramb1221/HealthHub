import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";

import { historyApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import { useResource } from "../hooks/useResource";
import { formatDateOnly, formatDateTime } from "../lib/format";
import { describeHistoryVerification } from "../lib/status";
import { isValidDateOnly } from "../lib/validation";
import type { RootStackParamList } from "../navigation/types";
import { AppText, Badge, Banner, Button, Card, Chip, DemoTag, Row, Screen, Stack, TextField } from "../ui/components";
import { EmptyState, ErrorState, LoadingState } from "../ui/states";

const SOURCE_LABEL: Record<string, string> = {
  patient_reported: "Reported by you",
  prescription: "From a prescription",
  prescription_scan: "From a scanned prescription",
  clinician: "From a clinician",
};

export function HistoryScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const res = useResource((signal) => historyApi.list(signal));
  const [filter, setFilter] = useState<"all" | "condition" | "prescription">("all");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [diagnosed, setDiagnosed] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const nameError = name.length > 0 && name.trim().length === 0 ? "Enter a condition name." : null;
  const today = new Date().toISOString().slice(0, 10);
  const diagnosedError =
    diagnosed.trim() && (!isValidDateOnly(diagnosed.trim()) || diagnosed.trim() < "1900-01-01" || diagnosed.trim() > today)
      ? "Use the format YYYY-MM-DD, for example 2024-03-15. The date can't be in the future."
      : null;

  async function add() {
    if (!name.trim() || diagnosedError) return;
    setSaving(true);
    setError(null);
    try {
      await historyApi.addCondition({ title: name.trim(), ...(notes.trim() ? { notes: notes.trim() } : {}), ...(diagnosed.trim() ? { diagnosedOn: diagnosed.trim() } : {}) });
      setName("");
      setNotes("");
      setDiagnosed("");
      setAdding(false);
      setSuccess(true);
      await res.reload(); // show what the server actually stored
    } catch (e) {
      const info = describeError(e);
      setError(`${info.title}. ${info.detail}`);
    } finally {
      setSaving(false);
    }
  }

  if (res.loading) return <Screen><LoadingState label="Loading your history…" /></Screen>;
  if (res.error && !res.data) return <Screen><ErrorState error={res.error} onRetry={res.reload} /></Screen>;
  const allItems = res.data?.items ?? [];

  const items = allItems.filter((h) => {
    if (filter === "all") return true;
    if (filter === "condition") return h.kind === "condition" || h.source === "patient_reported";
    if (filter === "prescription") return h.kind === "prescription" || h.source?.startsWith("prescription") || Boolean(h.relatedPrescriptionId);
    return true;
  });

  return (
    <Screen refreshing={res.refreshing} onRefresh={res.refresh}>
      <Stack>
        <Banner tone="info" title="Each entry shows where it came from" icon="info">
          Entries you add are self-reported and not verified by a clinician.
        </Banner>
        <Button label="View vaccination records" icon="shield" variant="secondary" onPress={() => nav.navigate("Vaccinations")} />
        <Row style={{ flexWrap: "wrap" }}>
          <Chip label="All" selected={filter === "all"} onPress={() => setFilter("all")} />
          <Chip label="Conditions" selected={filter === "condition"} onPress={() => setFilter("condition")} />
          <Chip label="Prescriptions" selected={filter === "prescription"} onPress={() => setFilter("prescription")} />
        </Row>
        {success ? <Banner tone="success" title="Condition added" icon="check-circle" /> : null}
        {adding ? (
          <Card>
            <AppText variant="heading" accessibilityRole="header">Add a condition</AppText>
            <TextField label="Condition" value={name} onChangeText={setName} error={nameError} hint="For example: Seasonal allergy" maxLength={120} />
            <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={500} />
            <TextField label="When it was diagnosed (optional)" value={diagnosed} onChangeText={setDiagnosed} error={diagnosedError} hint="YYYY-MM-DD, or leave blank" keyboardType="numbers-and-punctuation" />
            <AppText variant="caption" muted>Once saved, an entry can't be edited or removed yet, so check it before saving.</AppText>
            {error ? <Banner tone="danger" title={error} icon="alert-circle" /> : null}
            <Button label="Save condition" onPress={() => void add()} loading={saving} disabled={!name.trim() || Boolean(diagnosedError)} />
            <Button label="Cancel" variant="ghost" onPress={() => { setAdding(false); setError(null); }} disabled={saving} />
          </Card>
        ) : (
          <Button label="Add a condition" icon="plus" onPress={() => { setAdding(true); setSuccess(false); }} />
        )}
        {items.length === 0 ? (
          <EmptyState
            icon="book-open"
            title={filter === "all" ? "No history yet" : `No ${filter} entries`}
            body={filter === "all" ? "Conditions you add, and details from reviewed prescriptions, will appear here." : "No records match this filter."}
          />
        ) : (
          items.map((h) => {
            const ver = describeHistoryVerification(h.verificationStatus);
            return (
              <Card key={h.id}>
                <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <AppText variant="label" style={{ flex: 1 }}>{h.title}</AppText>
                  {h.isDemo ? <DemoTag /> : null}
                </Row>
                {h.notes ? <AppText variant="small" muted>{h.notes}</AppText> : null}
                {h.diagnosedOn ? <AppText variant="caption" muted>Diagnosed {formatDateOnly(h.diagnosedOn)}</AppText> : null}
                <AppText variant="caption" muted>Added {formatDateTime(h.createdAt)}</AppText>
                <Row style={{ flexWrap: "wrap" }}>
                  {h.source ? <Badge label={SOURCE_LABEL[h.source] ?? h.source.replace(/_/g, " ")} tone="neutral" icon="tag" /> : null}
                  {ver ? <Badge label={ver.label} tone={ver.tone} icon={ver.icon as never} /> : null}
                </Row>
                {h.relatedPrescriptionId ? (
                  <Button
                    label="Open prescription"
                    variant="secondary"
                    icon="file-text"
                    onPress={() => nav.navigate("PrescriptionDetail", { id: h.relatedPrescriptionId! })}
                  />
                ) : null}
              </Card>
            );
          })
        )}
      </Stack>
    </Screen>
  );
}
