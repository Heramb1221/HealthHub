import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { medicationApi, prescriptionApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { Prescription } from "../api/types";
import { suggestEndDate, suggestTimes } from "../lib/frequency";
import { isValidDateOnly, isValidTimeOfDay } from "../lib/validation";
import { AppText, Badge, Banner, Button, Card, Divider, Row, Stack, TextField } from "../ui/components";
import { colors, radius, space } from "../ui/theme";

interface WizardProps {
  visible: boolean;
  prescription: Prescription;
  onClose: () => void;
  onCompleted?: () => void;
}

const COMMON_PRESETS = [
  { label: "Morning", time: "08:00" },
  { label: "Afternoon", time: "13:00" },
  { label: "Evening", time: "18:00" },
  { label: "Night", time: "21:00" },
];

function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function MedicationSetupWizard({ visible, prescription, onClose, onCompleted }: WizardProps) {
  const medications = prescription.medications;
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const currentMed = medications[currentStep];

  const today = toIsoDate(new Date());
  const initialSuggested = suggestTimes(currentMed?.frequency);
  const [timesList, setTimesList] = useState<string[]>(() =>
    initialSuggested && initialSuggested.length > 0 ? initialSuggested : ["08:00"],
  );
  const [startDate, setStartDate] = useState(() => today);
  const [endDate, setEndDate] = useState(() => suggestEndDate(today, currentMed?.duration) ?? "");
  const [customTimeInput, setCustomTimeInput] = useState("");

  if (!visible || medications.length === 0 || !currentMed) return null;

  function togglePreset(time: string) {
    if (timesList.includes(time)) {
      if (timesList.length <= 1) {
        setError("At least one reminder time is required.");
        return;
      }
      setTimesList((prev) => prev.filter((t) => t !== time));
    } else {
      setTimesList((prev) => [...prev, time].sort());
    }
  }

  function addCustomTime() {
    const t = customTimeInput.trim();
    if (!t) return;
    if (!isValidTimeOfDay(t)) {
      setError("Please enter a valid 24-hour time format (e.g. 14:30).");
      return;
    }
    if (timesList.includes(t)) {
      setError("This reminder time is already added.");
      return;
    }
    setError(null);
    setTimesList((prev) => [...prev, t].sort());
    setCustomTimeInput("");
  }

  function removeTime(time: string) {
    if (timesList.length <= 1) {
      setError("At least one reminder time is required.");
      return;
    }
    setError(null);
    setTimesList((prev) => prev.filter((t) => t !== time));
  }

  async function handleSaveCurrentAndNext() {
    if (!currentMed) return;
    if (timesList.length === 0) {
      setError("At least one reminder time is required.");
      return;
    }
    if (startDate && !isValidDateOnly(startDate)) {
      setError("Start date must be in YYYY-MM-DD format.");
      return;
    }
    if (endDate && (!isValidDateOnly(endDate) || endDate < startDate)) {
      setError("End date must be on or after start date (YYYY-MM-DD).");
      return;
    }

    setSaving(true);
    setError(null);
    try {

      if (
        prescription.verificationStatus !== "patient_corrected" &&
        prescription.verificationStatus !== "verified_by_authorized_clinician"
      ) {
        try {
          await prescriptionApi.correct(prescription.id, {
            baseVersionNumber: 1,
            prescriptionDate: prescription.prescriptionDate,
            prescriberName: prescription.prescriberName,
            medications: prescription.medications.map((m) => ({
              name: m.name,
              strength: m.strength,
              dose: m.dose,
              route: m.route,
              frequency: m.frequency,
              duration: m.duration,
              instructions: m.instructions,
              confirmed: true,
            })),
          });
        } catch {

        }
      }

      let versionNum = 1;
      try {
        const latest = await prescriptionApi.latest(prescription.id);
        versionNum = latest.versionNumber;
      } catch {
        versionNum = 1;
      }

      await medicationApi.create({
        prescriptionId: prescription.id,
        versionNumber: versionNum,
        medicationPosition: currentStep,
        startDate,
        endDate: endDate ? endDate : null,
        reminderTimes: timesList,
        remindersEnabled: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      setSuccessMsg(`Reminders saved for ${currentMed.name ?? "medicine"}!`);

      if (currentStep < medications.length - 1) {
        const nextStep = currentStep + 1;
        const nextMed = medications[nextStep];
        setCurrentStep(nextStep);
        const nextSuggested = suggestTimes(nextMed?.frequency);
        setTimesList(nextSuggested && nextSuggested.length > 0 ? nextSuggested : ["08:00"]);
        setStartDate(today);
        setEndDate(suggestEndDate(today, nextMed?.duration) ?? "");
        setError(null);
      } else {
        setTimeout(() => {
          onCompleted?.();
          onClose();
        }, 800);
      }
    } catch (err) {
      const info = describeError(err);
      setError(`${info.title}. ${info.detail}`);
    } finally {
      setSaving(false);
    }
  }

  const isLast = currentStep === medications.length - 1;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <Stack gap={space.md}>

              <Row style={{ justifyContent: "space-between" }}>
                <Row style={{ gap: space.sm }}>
                  <Feather name="bell" size={20} color={colors.primary} />
                  <AppText variant="heading">Medication Reminder Setup</AppText>
                </Row>
                <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close modal">
                  <Feather name="x" size={22} color={colors.textMuted} />
                </Pressable>
              </Row>

              <AppText variant="small" muted>
                Step {currentStep + 1} of {medications.length}: Configure daily reminders for your extracted medicines.
              </AppText>

              {error ? <Banner tone="danger" title={error} icon="alert-circle" /> : null}
              {successMsg ? <Banner tone="success" title={successMsg} icon="check" /> : null}

              <Card>
                <Row style={{ justifyContent: "space-between" }}>
                  <AppText variant="label">{currentMed.name ?? "Medicine"}</AppText>
                  {currentMed.strength ? <Badge label={currentMed.strength} tone="info" /> : null}
                </Row>
                {currentMed.dose || currentMed.frequency ? (
                  <AppText variant="small" muted>
                    {[currentMed.dose, currentMed.frequency, currentMed.duration].filter(Boolean).join(" · ")}
                  </AppText>
                ) : null}
                {currentMed.instructions ? (
                  <AppText variant="caption" muted>
                    Note: {currentMed.instructions}
                  </AppText>
                ) : null}
              </Card>

              <Card>
                <AppText variant="label">Reminder Times</AppText>
                <AppText variant="caption" muted>
                  Choose quick presets or add specific times to be reminded:
                </AppText>

                <Row style={{ flexWrap: "wrap", gap: space.sm }}>
                  {COMMON_PRESETS.map((p) => {
                    const selected = timesList.includes(p.time);
                    return (
                      <Pressable
                        key={p.time}
                        onPress={() => togglePreset(p.time)}
                        style={[
                          styles.presetChip,
                          selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                      >
                        <AppText
                          variant="caption"
                          style={{ color: selected ? colors.onPrimary : colors.text, fontWeight: "600" }}
                        >
                          {p.label} ({p.time})
                        </AppText>
                      </Pressable>
                    );
                  })}
                </Row>

                <Divider />

                <AppText variant="caption" muted>Current selected times:</AppText>
                <Row style={{ flexWrap: "wrap", gap: space.xs }}>
                  {timesList.map((t) => (
                    <View key={t} style={styles.timeTag}>
                      <AppText variant="caption" style={{ fontWeight: "600" }}>{t}</AppText>
                      <Pressable onPress={() => removeTime(t)} hitSlop={8}>
                        <Feather name="x" size={14} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  ))}
                </Row>

                <Row style={{ gap: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="Add custom time (HH:MM)"
                      value={customTimeInput}
                      onChangeText={setCustomTimeInput}
                      placeholder="e.g. 14:00"
                    />
                  </View>
                  <View style={{ paddingTop: 20 }}>
                    <Button label="Add" variant="secondary" onPress={addCustomTime} />
                  </View>
                </Row>
              </Card>

              <Card>
                <AppText variant="label">Schedule Duration</AppText>
                <TextField
                  label="Start Date (YYYY-MM-DD)"
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                />
                <TextField
                  label="End Date (Optional, YYYY-MM-DD)"
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="YYYY-MM-DD"
                  hint="Leave blank for ongoing medications"
                />
              </Card>

              <Stack gap={space.sm}>
                <Button
                  label={saving ? "Saving…" : isLast ? "Save & Finish Setup" : "Save & Next Medicine →"}
                  icon={isLast ? "check" : "arrow-right"}
                  onPress={() => void handleSaveCurrentAndNext()}
                  loading={saving}
                />
                {currentStep > 0 ? (
                  <Button
                    label="← Previous Medicine"
                    variant="ghost"
                    onPress={() => {
                      const prevStep = currentStep - 1;
                      const prevMed = medications[prevStep];
                      setCurrentStep(prevStep);
                      const prevSuggested = suggestTimes(prevMed?.frequency);
                      setTimesList(prevSuggested && prevSuggested.length > 0 ? prevSuggested : ["08:00"]);
                      setStartDate(today);
                      setEndDate(suggestEndDate(today, prevMed?.duration) ?? "");
                      setError(null);
                    }}
                    disabled={saving}
                  />
                ) : null}
                <Button
                  label="Skip for now"
                  variant="ghost"
                  onPress={onClose}
                  disabled={saving}
                />
              </Stack>
            </Stack>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "90%",
    padding: space.lg,
  },
  scrollContent: {
    paddingBottom: space.xxl,
  },
  presetChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  timeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
});
