import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable } from "react-native";

import { medicationApi, prescriptionApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { Prescription, PrescriptionMedication } from "../api/types";
import { useResource } from "../hooks/useResource";
import { suggestEndDate, suggestTimes } from "../lib/frequency";
import { formatDateOnly } from "../lib/format";
import { medicationReviewReasons, REVIEW_REASON_LABEL, SCHEDULE_BLOCK_LABEL, scheduleBlock } from "../lib/safety";
import { isValidDateOnly, isValidTimeOfDay, parseList } from "../lib/validation";
import type { RootStackParamList } from "../navigation/types";
import { AppText, Badge, Banner, Button, Card, Chip, Divider, Row, Screen, Stack, TextField } from "../ui/components";
import { EmptyState, ErrorState, LoadingState } from "../ui/states";
import { colors, space } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "AddSchedule">;

interface Option {
  rx: Prescription;
  index: number;
  med: PrescriptionMedication;
  reasons: string[];
  already: boolean;
  block: ReturnType<typeof scheduleBlock>;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AddScheduleScreen({ route, navigation }: Props) {
  const params = route.params;
  const prescriptions = useResource((signal) => prescriptionApi.list(signal));
  const schedules = useResource((signal) => medicationApi.list(signal));

  const initialKey =
    params?.prescriptionId && params?.medicationPosition !== undefined
      ? `${params.prescriptionId}:${params.medicationPosition}`
      : null;

  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  const [startDate, setStartDate] = useState(() => todayKey());
  const [endDate, setEndDate] = useState("");
  const [timesText, setTimesText] = useState("09:00");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scheduledKeys = useMemo(() => {
    return new Set(
      (schedules.data?.items ?? [])
        .filter((s) => s.isActive)
        .map((s) => `${s.prescriptionId}:${(s.medication.name ?? "").toLowerCase()}`),
    );
  }, [schedules.data]);

  const options: Option[] = useMemo(() => {
    const out: Option[] = [];
    for (const rx of prescriptions.data?.items ?? []) {
      if (rx.processingStatus !== "completed") continue;
      rx.medications.forEach((med, index) => {
        const reasons = medicationReviewReasons(med).map((r) => REVIEW_REASON_LABEL[r]);
        const already = scheduledKeys.has(`${rx.id}:${(med.name ?? "").toLowerCase()}`);
        const block = scheduleBlock(rx, med);
        out.push({ rx, index, med, reasons, already, block });
      });
    }
    return out;
  }, [prescriptions.data, scheduledKeys]);

  const selectedOption = useMemo(() => {
    if (!selectedKey) return null;
    const [rxId, idxStr] = selectedKey.split(":");
    const idx = Number(idxStr);
    return options.find((o) => o.rx.id === rxId && o.index === idx) ?? null;
  }, [selectedKey, options]);

  function handleSelectOption(key: string, opt: Option) {
    if (selectedKey === key) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey(key);
    const suggested = suggestTimes(opt.med.frequency);
    if (suggested && suggested.length > 0) {
      setTimesText(suggested.join(", "));
    } else {
      setTimesText("09:00");
    }
    const end = suggestEndDate(startDate, opt.med.duration);
    setEndDate(end ?? "");
  }

  if (prescriptions.loading || schedules.loading) {
    return <Screen><LoadingState label="Loading your prescriptions…" /></Screen>;
  }
  if (prescriptions.error && !prescriptions.data) {
    return <Screen><ErrorState error={prescriptions.error} onRetry={prescriptions.reload} /></Screen>;
  }
  if (schedules.error && !schedules.data) {
    return <Screen><ErrorState error={schedules.error} onRetry={schedules.reload} /></Screen>;
  }

  const badTimes = parseList(timesText).filter((t) => !isValidTimeOfDay(t));
  const timesError = badTimes.length ? `Use 24-hour HH:mm, for example 08:00. Not valid: ${badTimes.join(", ")}` : null;
  const startDateError = startDate && !isValidDateOnly(startDate) ? "Use the format YYYY-MM-DD" : null;
  const endDateError = endDate && (!isValidDateOnly(endDate) || endDate < startDate) ? "End date must be on or after start date (YYYY-MM-DD)" : null;

  async function save() {
    if (!selectedOption) return;
    if (timesError || startDateError || endDateError) return;
    const parsedTimes = parseList(timesText).sort();
    if (parsedTimes.length === 0) {
      setError("Add at least one reminder time (e.g. 08:00).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const latestVersion = await prescriptionApi.latest(selectedOption.rx.id);
      await medicationApi.create({
        prescriptionId: selectedOption.rx.id,
        versionNumber: latestVersion.versionNumber,
        medicationPosition: selectedOption.index,
        startDate,
        endDate: endDate ? endDate : null,
        reminderTimes: parsedTimes,
        remindersEnabled: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      navigation.goBack();
    } catch (e) {
      const info = describeError(e);
      setError(`${info.title}. ${info.detail}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Stack>
        <Banner tone="info" title="Choose a medicine from your prescriptions" icon="info">
          Only medicines from reviewed prescriptions that have complete details can be scheduled.
        </Banner>

        {error ? <Banner tone="danger" title={error} icon="alert-circle" /> : null}

        {options.length === 0 ? (
          <EmptyState
            icon="file-text"
            title="No readable medicines found"
            body="Upload a prescription and review its details to add medicines to your schedule."
          />
        ) : (
          <Stack gap={space.md}>
            <AppText variant="heading" accessibilityRole="header">Available medicines</AppText>
            {options.map((opt) => {
              const key = `${opt.rx.id}:${opt.index}`;
              const isSelected = selectedKey === key;
              const disabled = opt.already || Boolean(opt.block);

              return (
                <Pressable
                  key={key}
                  disabled={disabled}
                  onPress={() => handleSelectOption(key, opt)}
                  accessibilityRole="button"
                  accessibilityLabel={`${opt.med.name ?? "Medicine"}${disabled ? " (cannot schedule)" : ""}`}
                >
                  <Card style={{ borderColor: isSelected ? colors.primary : colors.border, borderWidth: isSelected ? 2 : 1 }}>
                    <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <Stack gap={2} style={{ flex: 1 }}>
                        <AppText variant="label">{opt.med.name ?? "Name not found"}</AppText>
                        <AppText variant="small" muted>
                          {[opt.med.strength, opt.med.dose, opt.med.frequency].filter(Boolean).join(" · ") || "Details missing"}
                        </AppText>
                        <AppText variant="caption" muted>
                          From prescription of {formatDateOnly(opt.rx.prescriptionDate ?? opt.rx.createdAt)}
                        </AppText>
                      </Stack>
                      {opt.already ? (
                        <Badge label="Already scheduled" tone="neutral" icon="check" />
                      ) : opt.block ? (
                        <Badge label="Needs review" tone="warning" icon="alert-triangle" />
                      ) : isSelected ? (
                        <Badge label="Selected" tone="success" icon="check-circle" />
                      ) : null}
                    </Row>

                    {opt.block ? (
                      <AppText variant="caption" color={colors.warning}>
                        {SCHEDULE_BLOCK_LABEL[opt.block]}
                      </AppText>
                    ) : null}
                  </Card>
                </Pressable>
              );
            })}
          </Stack>
        )}

        {selectedOption && !selectedOption.already && !selectedOption.block ? (
          <Card>
            <AppText variant="heading" accessibilityRole="header">Set schedule details</AppText>
            <AppText variant="small">
              Scheduling: <AppText variant="label">{selectedOption.med.name} {selectedOption.med.strength ?? ""}</AppText>
            </AppText>
            <Divider />

            <TextField
              label="Start date"
              value={startDate}
              onChangeText={setStartDate}
              error={startDateError}
              hint="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
            />

            <TextField
              label="End date (optional)"
              value={endDate}
              onChangeText={setEndDate}
              error={endDateError}
              hint="YYYY-MM-DD, or leave blank for ongoing"
              keyboardType="numbers-and-punctuation"
            />

            <TextField
              label="Reminder times"
              value={timesText}
              onChangeText={setTimesText}
              error={timesError}
              hint="24-hour times separated by commas, for example 08:00, 20:00"
              autoCapitalize="none"
            />

            <Chip
              label={confirmed ? "Checked against paper prescription" : "I checked this medicine against my paper prescription"}
              selected={confirmed}
              onPress={() => setConfirmed((c) => !c)}
            />
            <AppText variant="caption" muted>
              Confirming is your own check against your doctor's instructions.
            </AppText>

            <Button
              label="Add to schedule"
              onPress={() => void save()}
              loading={saving}
              disabled={!confirmed || Boolean(timesError || startDateError || endDateError)}
            />
          </Card>
        ) : null}
      </Stack>
    </Screen>
  );
}
