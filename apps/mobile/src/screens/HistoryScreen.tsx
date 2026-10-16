import { useState } from "react";

import { historyApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import { useResource } from "../hooks/useResource";
import { formatDateOnly, formatDateTime } from "../lib/format";
import { describeHistoryVerification } from "../lib/status";
import { isValidDateOnly } from "../lib/validation";
import { AppText, Badge, Banner, Button, Card, Row, Screen, Stack, TextField } from "../ui/components";
import { EmptyState, ErrorState, LoadingState } from "../ui/states";

const SOURCE_LABEL: Record<string, string> = {
  patient_reported: "Reported by you",
  prescription: "From a prescription",
  clinician: "From a clinician",
};

export function HistoryScreen() {
  const res = useResource((signal) => historyApi.list(signal));
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
  const items = res.data?.items ?? [];

  return (
    <Screen refreshing={res.refreshing} onRefresh={res.refresh}>
      <Stack>
        <Banner tone="info" title="Each entry shows where it came from" icon="info">
          Entries you add are self-reported and not verified by a clinician.
        </Banner>
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
          <EmptyState icon="book-open" title="No history yet" body="Conditions you add, and details from reviewed prescriptions, will appear here." />
        ) : (
          items.map((h) => {
            const ver = describeHistoryVerification(h.verificationStatus);
            return (
              <Card key={h.id}>
                <AppText variant="label">{h.title}</AppText>
                {h.notes ? <AppText variant="small" muted>{h.notes}</AppText> : null}
                {h.diagnosedOn ? <AppText variant="caption" muted>Diagnosed {formatDateOnly(h.diagnosedOn)}</AppText> : null}
                <AppText variant="caption" muted>Added {formatDateTime(h.createdAt)}</AppText>
                <Row style={{ flexWrap: "wrap" }}>
                  {h.source ? <Badge label={SOURCE_LABEL[h.source] ?? h.source.replace(/_/g, " ")} tone="neutral" icon="tag" /> : null}
                  {ver ? <Badge label={ver.label} tone={ver.tone} icon={ver.icon as never} /> : null}
                </Row>
              </Card>
            );
          })
        )}
      </Stack>
    </Screen>
  );
}
