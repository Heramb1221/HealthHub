import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import { useState } from "react";

import { patientApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { BloodGroup, Gender, Patient, PatientUpdate } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { API_CONFIG, IS_DEMO } from "../config";
import { useResource } from "../hooks/useResource";
import { useServerValue } from "../hooks/useServerValue";
import { formatDateOnly, orDash } from "../lib/format";
import { BLOOD_GROUPS, GENDER_OPTIONS, genderLabel } from "../lib/profileOptions";
import { blankToNull, dateOfBirthProblem, listProblem, listToText, parseList, phoneProblem } from "../lib/validation";
import type { RootStackParamList } from "../navigation/types";
import { AppText, Banner, Button, Card, Chip, Divider, Field, ListRow, Row, Screen, Stack, TextField } from "../ui/components";
import { ErrorState, LoadingState } from "../ui/states";
import { space } from "../ui/theme";

interface Form {
  fullName: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  allergies: string;
  existingConditions: string;
  currentMedications: string;
  address: string;
}

function toForm(p: Patient): Form {
  return {
    fullName: p.fullName ?? "",
    dateOfBirth: p.dateOfBirth ?? "",
    gender: p.gender ?? "",
    bloodGroup: p.bloodGroup ?? "",
    phone: p.phone ?? "",
    emergencyContactName: p.emergencyContact?.name ?? "",
    emergencyContactPhone: p.emergencyContact?.phone ?? "",
    allergies: listToText(p.allergies),
    existingConditions: listToText(p.existingConditions),
    currentMedications: listToText(p.currentMedications),
    address: p.address ?? "",
  };
}

export function ProfileScreen() {
  const { state, signOut } = useAuth();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const res = useResource((signal) => patientApi.me(signal));
  const [patient, setPatient] = useServerValue<Patient>(res.data);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const email = state.status === "signedIn" ? state.user.email : "";

  if (res.loading && !patient) return <Screen><LoadingState label="Loading your profile…" /></Screen>;
  if (res.error && !patient) return <Screen><ErrorState error={res.error} onRetry={res.reload} /></Screen>;
  if (!patient) return null;

  const set = (key: keyof Form) => (value: string) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const dobError = form ? dateOfBirthProblem(form.dateOfBirth) : null;
  const phoneError = form ? phoneProblem(form.phone) : null;
  const emergencyPhoneError = form ? phoneProblem(form.emergencyContactPhone) : null;
  const listErrors = form
    ? {
        allergies: listProblem(parseList(form.allergies)),
        existingConditions: listProblem(parseList(form.existingConditions)),
        currentMedications: listProblem(parseList(form.currentMedications)),
      }
    : null;
  const hasErrors = Boolean(dobError || phoneError || emergencyPhoneError || (listErrors && Object.values(listErrors).some(Boolean)));

  async function save() {
    if (!form || hasErrors) return;
    setSaving(true);
    setSaveError(null);
    const body: PatientUpdate = {
      fullName: blankToNull(form.fullName),
      dateOfBirth: blankToNull(form.dateOfBirth),
      gender: (form.gender || null) as Gender | null,
      bloodGroup: (form.bloodGroup || null) as BloodGroup | null,
      phone: blankToNull(form.phone),
      emergencyContact: { name: blankToNull(form.emergencyContactName), phone: blankToNull(form.emergencyContactPhone) },
      allergies: parseList(form.allergies),
      existingConditions: parseList(form.existingConditions),
      currentMedications: parseList(form.currentMedications),
      address: blankToNull(form.address),
    };
    try {
      const updated = await patientApi.update(body);
      setPatient(updated); // show exactly what the server stored
      setEditing(false);
      setSaved(true);
    } catch (error) {
      const info = describeError(error);
      setSaveError(`${info.title}. ${info.detail}`);
    } finally {
      setSaving(false);
    }
  }

  async function doSignOut() {
    setSigningOut(true);
    await signOut(); // any server-confirmation warning is shown on the Welcome screen
  }

  if (editing && form) {
    return (
      <Screen>
        <Stack>
          {saveError ? <Banner tone="danger" title={saveError} icon="alert-circle" /> : null}
          <Banner tone="info" title="What you enter here is self-reported" icon="info">
            It is not verified by a clinician. Allergies and conditions are for your own records.
          </Banner>
          <TextField label="Full name" value={form.fullName} onChangeText={set("fullName")} autoComplete="name" />
          <TextField label="Date of birth" value={form.dateOfBirth} onChangeText={set("dateOfBirth")} error={dobError} hint="YYYY-MM-DD, for example 1998-04-23" keyboardType="numbers-and-punctuation" />
          <Stack gap={8}>
            <AppText variant="label">Gender</AppText>
            <Row style={{ flexWrap: "wrap" }}>
              {GENDER_OPTIONS.map((g) => (
                <Chip key={g.value} label={g.label} selected={form.gender === g.value} onPress={() => set("gender")(form.gender === g.value ? "" : g.value)} />
              ))}
            </Row>
          </Stack>
          <Stack gap={8}>
            <AppText variant="label">Blood group</AppText>
            <Row style={{ flexWrap: "wrap" }}>
              {BLOOD_GROUPS.map((b) => (
                <Chip key={b} label={b} selected={form.bloodGroup === b} onPress={() => set("bloodGroup")(form.bloodGroup === b ? "" : b)} />
              ))}
            </Row>
            <AppText variant="caption" muted>Tap a selected option again to clear it.</AppText>
          </Stack>
          <TextField label="Phone" value={form.phone} onChangeText={set("phone")} error={phoneError} hint="For example: +91 98765 43210" keyboardType="phone-pad" autoComplete="tel" />
          <TextField label="Emergency contact name" value={form.emergencyContactName} onChangeText={set("emergencyContactName")} />
          <TextField label="Emergency contact phone" value={form.emergencyContactPhone} onChangeText={set("emergencyContactPhone")} error={emergencyPhoneError} keyboardType="phone-pad" />
          <TextField label="Allergies" value={form.allergies} onChangeText={set("allergies")} error={listErrors?.allergies ?? null} hint="Separate with commas" multiline />
          <TextField label="Existing conditions" value={form.existingConditions} onChangeText={set("existingConditions")} error={listErrors?.existingConditions ?? null} hint="Separate with commas" multiline />
          <TextField label="Current medications" value={form.currentMedications} onChangeText={set("currentMedications")} error={listErrors?.currentMedications ?? null} hint="Separate with commas. Self-reported; not used for dose instructions." multiline />
          <TextField label="Address" value={form.address} onChangeText={set("address")} multiline />
          <Button label="Save changes" onPress={() => void save()} loading={saving} disabled={hasErrors} />
          <Button label="Cancel" variant="ghost" onPress={() => { setEditing(false); setSaveError(null); }} disabled={saving} />
        </Stack>
      </Screen>
    );
  }

  return (
    <Screen refreshing={res.refreshing} onRefresh={res.refresh}>
      <Stack>
        {saved ? <Banner tone="success" title="Profile saved" icon="check-circle" /> : null}
        <Card>
          <Field label="HealthHub ID" value={patient.healthId} />
          <Field label="Account email" value={email || "Not provided"} />
        </Card>
        <Card>
          <AppText variant="heading" accessibilityRole="header">Personal details</AppText>
          <Field label="Full name" value={orDash(patient.fullName)} />
          <Field label="Date of birth" value={formatDateOnly(patient.dateOfBirth)} />
          <Field label="Gender" value={genderLabel(patient.gender)} />
          <Field label="Blood group" value={orDash(patient.bloodGroup)} />
          <Field label="Phone" value={orDash(patient.phone)} />
          <Field label="Address" value={orDash(patient.address)} />
          <Divider />
          <Field label="Emergency contact" value={[patient.emergencyContact?.name, patient.emergencyContact?.phone].filter(Boolean).join(" · ") || "Not provided"} />
        </Card>
        <Card>
          <AppText variant="heading" accessibilityRole="header">Health information (self-reported)</AppText>
          <Field label="Allergies" value={patient.allergies.length ? patient.allergies.join(", ") : "None listed"} />
          <Field label="Existing conditions" value={patient.existingConditions.length ? patient.existingConditions.join(", ") : "None listed"} />
          <Field label="Current medications" value={patient.currentMedications.length ? patient.currentMedications.join(", ") : "None listed"} />
        </Card>
        <Card style={{ gap: 0 }}>
          <ListRow title="Sharing and access" subtitle="See and revoke who can view your records" onPress={() => nav.navigate("Sharing")} />
          <ListRow title="Digital health card" onPress={() => nav.navigate("HealthCard")} />
          <ListRow title="Medical history" onPress={() => nav.navigate("History")} />
        </Card>
        <Button label="Edit profile" icon="edit-2" onPress={() => { setForm(toForm(patient)); setSaved(false); setEditing(true); }} />
        <Card>
          <AppText variant="heading" accessibilityRole="header">About HealthHub</AppText>
          <Field label="Version" value={Constants.expoConfig?.version ?? "Unknown"} />
          <Field label="Connection" value={IS_DEMO ? "Demo mode (built-in sample data)" : `Live server: ${hostOf(API_CONFIG.baseUrl)}`} />
          <AppText variant="small" muted>
            HealthHub is a prototype, not a medical device. It does not diagnose, prescribe or change treatment. Text read from a prescription by
            computer can be wrong, so always check it against your paper prescription and follow your doctor's instructions.
          </AppText>
        </Card>
        <Button label="Sign out" variant="danger" icon="log-out" loading={signingOut} onPress={() => void doSignOut()} />
        <AppText variant="caption" muted style={{ paddingTop: space.sm }}>
          Signing out ends your session on the server and clears this phone's stored sign-in and local reminders.
        </AppText>
      </Stack>
    </Screen>
  );
}

function hostOf(url: string | null): string {
  try {
    return url ? new URL(url).host : "not set";
  } catch {
    return "not set";
  }
}
