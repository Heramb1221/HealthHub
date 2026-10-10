import { useEffect, useState } from "react";

import { patientApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { Patient, PatientUpdate } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useResource } from "../hooks/useResource";
import { formatDateOnly, orDash, toDateInput } from "../lib/format";
import { blankToNull, isFutureDateOnly, isValidDateOnly, listToText, parseList } from "../lib/validation";
import { AppText, Banner, Button, Card, Divider, Field, Screen, Stack, TextField } from "../ui/components";
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
    dateOfBirth: toDateInput(p.dateOfBirth),
    gender: p.gender ?? "",
    bloodGroup: p.bloodGroup ?? "",
    phone: p.phone ?? "",
    emergencyContactName: p.emergencyContactName ?? "",
    emergencyContactPhone: p.emergencyContactPhone ?? "",
    allergies: listToText(p.allergies),
    existingConditions: listToText(p.existingConditions),
    currentMedications: listToText(p.currentMedications),
    address: p.address ?? "",
  };
}

export function ProfileScreen() {
  const { state, signOut } = useAuth();
  const res = useResource((signal) => patientApi.me(signal));
  const [patient, setPatient] = useState<Patient | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (res.data && !editing) setPatient(res.data);
  }, [res.data, editing]);

  const email = state.status === "signedIn" ? state.user.email : "";

  if (res.loading && !patient) return <Screen><LoadingState label="Loading your profile…" /></Screen>;
  if (res.error && !patient) return <Screen><ErrorState error={res.error} onRetry={res.reload} /></Screen>;
  if (!patient) return null;

  const set = (key: keyof Form) => (value: string) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const dobError =
    form && form.dateOfBirth
      ? !isValidDateOnly(form.dateOfBirth)
        ? "Use the format YYYY-MM-DD, for example 1998-04-23."
        : isFutureDateOnly(form.dateOfBirth)
          ? "Date of birth can't be in the future."
          : null
      : null;

  async function save() {
    if (!form || dobError) return;
    setSaving(true);
    setSaveError(null);
    const body: PatientUpdate = {
      fullName: blankToNull(form.fullName),
      dateOfBirth: blankToNull(form.dateOfBirth),
      gender: blankToNull(form.gender),
      bloodGroup: blankToNull(form.bloodGroup),
      phone: blankToNull(form.phone),
      emergencyContactName: blankToNull(form.emergencyContactName),
      emergencyContactPhone: blankToNull(form.emergencyContactPhone),
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
          <TextField label="Gender" value={form.gender} onChangeText={set("gender")} />
          <TextField label="Blood group" value={form.bloodGroup} onChangeText={set("bloodGroup")} hint="For example: B+" autoCapitalize="characters" />
          <TextField label="Phone" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" autoComplete="tel" />
          <TextField label="Emergency contact name" value={form.emergencyContactName} onChangeText={set("emergencyContactName")} />
          <TextField label="Emergency contact phone" value={form.emergencyContactPhone} onChangeText={set("emergencyContactPhone")} keyboardType="phone-pad" />
          <TextField label="Allergies" value={form.allergies} onChangeText={set("allergies")} hint="Separate with commas" multiline />
          <TextField label="Existing conditions" value={form.existingConditions} onChangeText={set("existingConditions")} hint="Separate with commas" multiline />
          <TextField label="Current medications" value={form.currentMedications} onChangeText={set("currentMedications")} hint="Separate with commas" multiline />
          <TextField label="Address" value={form.address} onChangeText={set("address")} multiline />
          <Button label="Save changes" onPress={() => void save()} loading={saving} disabled={Boolean(dobError)} />
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
          <Field label="Gender" value={orDash(patient.gender)} />
          <Field label="Blood group" value={orDash(patient.bloodGroup)} />
          <Field label="Phone" value={orDash(patient.phone)} />
          <Field label="Address" value={orDash(patient.address)} />
          <Divider />
          <Field label="Emergency contact" value={[patient.emergencyContactName, patient.emergencyContactPhone].filter(Boolean).join(" · ") || "Not provided"} />
        </Card>
        <Card>
          <AppText variant="heading" accessibilityRole="header">Health information (self-reported)</AppText>
          <Field label="Allergies" value={patient.allergies?.length ? patient.allergies.join(", ") : "None listed"} />
          <Field label="Existing conditions" value={patient.existingConditions?.length ? patient.existingConditions.join(", ") : "None listed"} />
          <Field label="Current medications" value={patient.currentMedications?.length ? patient.currentMedications.join(", ") : "None listed"} />
        </Card>
        <Button label="Edit profile" icon="edit-2" onPress={() => { setForm(toForm(patient)); setSaved(false); setEditing(true); }} />
        <Button label="Sign out" variant="danger" icon="log-out" loading={signingOut} onPress={() => void doSignOut()} />
        <AppText variant="caption" muted style={{ paddingTop: space.sm }}>
          Signing out ends your session on the server and clears this phone's stored sign-in and local reminders.
        </AppText>
      </Stack>
    </Screen>
  );
}
