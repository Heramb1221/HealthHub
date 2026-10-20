import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { symptomApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { PossibleExplanation, SymptomAssessmentResult, TriageUrgency } from "../api/types";
import { AppText, Badge, Banner, Button, Card, Chip, Heading, Row, Screen, Stack, TextField } from "../ui/components";
import { colors, space, type Tone } from "../ui/theme";

const COMMON_SYMPTOMS = [
  "Fever",
  "Cough",
  "Headache",
  "Sore throat",
  "Fatigue",
  "Abdominal pain",
  "Shortness of breath",
  "Chest tightness",
  "Nausea",
  "Dizziness",
  "Back pain",
  "Skin rash",
];

export function SymptomCheckerScreen() {
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [customSymptom, setCustomSymptom] = useState("");
  const [severity, setSeverity] = useState<"mild" | "moderate" | "severe">("moderate");
  const [durationDays, setDurationDays] = useState("3");
  const [patientAge, setPatientAge] = useState("30");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SymptomAssessmentResult | null>(null);

  function toggleSymptom(name: string) {
    if (symptoms.includes(name)) {
      setSymptoms(symptoms.filter((s) => s !== name));
    } else {
      if (symptoms.length >= 10) {
        Alert.alert("Limit Reached", "You can check up to 10 symptoms at a time.");
        return;
      }
      setSymptoms([...symptoms, name]);
    }
  }

  function addCustom() {
    const trimmed = customSymptom.trim();
    if (!trimmed) return;
    if (symptoms.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert("Already added", `"${trimmed}" is already in your symptoms list.`);
      return;
    }
    setSymptoms([...symptoms, trimmed]);
    setCustomSymptom("");
  }

  async function handleAssess() {
    if (symptoms.length === 0) {
      Alert.alert("Add Symptoms", "Please choose or type at least one symptom to check.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const parsedDays = durationDays ? parseInt(durationDays, 10) : undefined;
      const parsedAge = patientAge ? parseInt(patientAge, 10) : undefined;
      const res = await symptomApi.assess({
        symptoms,
        severity,
        durationDays: isNaN(parsedDays as number) ? undefined : parsedDays,
        patientAge: isNaN(parsedAge as number) ? undefined : parsedAge,
        description: description.trim() || undefined,
      });
      setResult(res);
    } catch (e) {
      const info = describeError(e);
      setError(`${info.title}. ${info.detail}`);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setSymptoms([]);
    setCustomSymptom("");
    setSeverity("moderate");
    setDurationDays("3");
    setDescription("");
    setError(null);
    setResult(null);
  }

  const urgencyTones: Record<TriageUrgency, Tone> = {
    emergency: "danger",
    urgent: "warning",
    routine: "info",
    self_care: "success",
  };

  return (
    <Screen>
      <Stack gap={space.lg}>

        <Banner tone="warning" title="Informational Clinical Triage" icon="alert-triangle">
          This automated checker is for guidance only and does NOT provide a medical diagnosis. If you have sudden chest
          pressure, difficulty breathing, or stroke symptoms, call emergency services immediately.
        </Banner>

        <Card>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <AppText variant="label">Medical Emergency?</AppText>
              <AppText variant="small" muted>
                National Helpline & Ambulance
              </AppText>
            </View>
            <Row style={{ gap: space.sm }}>
              <Button
                label="Call 112"
                variant="danger"
                icon="phone"
                onPress={() => void Linking.openURL("tel:112")}
                style={{ minHeight: 40, paddingVertical: 8, paddingHorizontal: 12 }}
              />
              <Button
                label="Call 108"
                variant="secondary"
                icon="phone"
                onPress={() => void Linking.openURL("tel:108")}
                style={{ minHeight: 40, paddingVertical: 8, paddingHorizontal: 12 }}
              />
            </Row>
          </Row>
        </Card>

        {error ? <Banner tone="danger" title={error} icon="alert-circle" /> : null}

        {!result ? (
          <>

            <Card>
              <Heading level={2}>1. Select Symptoms</Heading>
              <AppText variant="small" muted>
                Tap common symptoms or add custom ones below.
              </AppText>

              <View style={styles.chipGrid}>
                {COMMON_SYMPTOMS.map((sym) => {
                  const sel = symptoms.includes(sym);
                  return (
                    <Chip key={sym} label={sym} selected={sel} onPress={() => toggleSymptom(sym)} />
                  );
                })}
              </View>

              <Row style={{ alignItems: "center", marginTop: space.sm }}>
                <View style={{ flex: 1 }}>
                  <TextField
                    label="Add other symptom"
                    value={customSymptom}
                    onChangeText={setCustomSymptom}
                    placeholder="e.g. Swollen ankle"
                    returnKeyType="done"
                    onSubmitEditing={addCustom}
                  />
                </View>
                <Button label="Add" variant="secondary" onPress={addCustom} disabled={!customSymptom.trim()} style={{ marginTop: 20 }} />
              </Row>

              {symptoms.length > 0 ? (
                <View style={styles.selectedBox}>
                  <AppText variant="label">Selected for check ({symptoms.length}):</AppText>
                  <View style={styles.chipGrid}>
                    {symptoms.map((s) => (
                      <Pressable key={s} onPress={() => toggleSymptom(s)} style={styles.selectedChip}>
                        <Text style={styles.selectedChipText}>{s}</Text>
                        <Feather name="x" size={14} color={colors.primary} />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </Card>

            <Card>
              <Heading level={2}>2. Overall Severity</Heading>
              <Row style={{ gap: space.sm }}>
                <Chip label="Mild" selected={severity === "mild"} onPress={() => setSeverity("mild")} />
                <Chip label="Moderate" selected={severity === "moderate"} onPress={() => setSeverity("moderate")} />
                <Chip label="Severe" selected={severity === "severe"} onPress={() => setSeverity("severe")} />
              </Row>
            </Card>

            <Card>
              <Heading level={2}>3. Duration & Age</Heading>
              <Row style={{ gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <TextField
                    label="Duration (days)"
                    value={durationDays}
                    onChangeText={setDurationDays}
                    keyboardType="number-pad"
                    placeholder="3"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField
                    label="Patient age"
                    value={patientAge}
                    onChangeText={setPatientAge}
                    keyboardType="number-pad"
                    placeholder="30"
                  />
                </View>
              </Row>
            </Card>

            <Card>
              <Heading level={2}>4. Additional Context (Optional)</Heading>
              <TextField
                label="Description"
                value={description}
                onChangeText={setDescription}
                placeholder="Mention triggers, worsening factors, or past medical history..."
                multiline
                numberOfLines={3}
              />
            </Card>

            <Button
              label={loading ? "Analyzing Triage…" : "Assess Symptoms"}
              icon="activity"
              variant="primary"
              onPress={() => void handleAssess()}
              loading={loading}
              disabled={symptoms.length === 0}
            />
          </>
        ) : (

          <Stack gap={space.lg}>

            <Card>
              <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Heading level={2}>{result.urgencyLabel}</Heading>
                <Badge label={result.urgency.toUpperCase()} tone={urgencyTones[result.urgency]} />
              </Row>
              <AppText style={{ marginTop: space.xs, fontWeight: "500" }}>{result.recommendedAction}</AppText>
              {result.urgency === "emergency" ? (
                <Button
                  label="Call 112 (Emergency Services)"
                  variant="danger"
                  icon="phone"
                  onPress={() => void Linking.openURL("tel:112")}
                  style={{ marginTop: space.sm }}
                />
              ) : null}
            </Card>

            {result.redFlags && result.redFlags.length > 0 ? (
              <Banner tone="danger" title="Critical Red Flags Detected" icon="alert-circle">
                {result.redFlags.join("\n• ")}
              </Banner>
            ) : null}

            <Card>
              <Heading level={2}>Possible Explanations</Heading>
              <AppText variant="small" muted style={{ marginBottom: space.sm }}>
                Differential considerations based on reported symptoms:
              </AppText>
              {result.possibleExplanations.map((exp: PossibleExplanation, idx: number) => {
                const toneMap: Record<string, Tone> = {
                  high: "danger",
                  moderate: "warning",
                  low: "neutral",
                  possible: "info",
                };
                return (
                  <View key={idx} style={styles.explanationItem}>
                    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <AppText variant="label">{exp.condition}</AppText>
                      <Badge label={`${exp.likelihood} likelihood`} tone={toneMap[exp.likelihood] ?? "neutral"} />
                    </Row>
                    <AppText variant="small" muted style={{ marginTop: 4 }}>
                      {exp.description}
                    </AppText>
                  </View>
                );
              })}
            </Card>

            {result.followUpQuestions && result.followUpQuestions.length > 0 ? (
              <Card>
                <Heading level={2}>Questions for Your Doctor</Heading>
                {result.followUpQuestions.map((q, idx) => (
                  <Row key={idx} style={{ alignItems: "flex-start", gap: 8, marginTop: 4 }}>
                    <Feather name="chevron-right" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                    <AppText variant="small" style={{ flex: 1 }}>
                      {q}
                    </AppText>
                  </Row>
                ))}
              </Card>
            ) : null}

            <Banner tone="neutral" title="Clinical Safety Disclaimer" icon="info">
              {result.clinicalDisclaimer}
            </Banner>

            <Button label="Start New Assessment" variant="secondary" icon="rotate-ccw" onPress={handleReset} />
          </Stack>
        )}
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
    marginTop: space.sm,
  },
  selectedBox: {
    marginTop: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  selectedChipText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "500",
  },
  explanationItem: {
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
