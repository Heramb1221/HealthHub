import { useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";

import { appointmentApi, medicationApi, patientApi, prescriptionApi } from "../api/endpoints";
import { useResource } from "../hooks/useResource";
import { appointmentHospitalName, appointmentStart, nextAppointment } from "../lib/appointments";
import { formatDateTime } from "../lib/format";
import { nextReminder } from "../lib/schedule";
import { useLanguage } from "../i18n/LanguageContext";
import { SUPPORTED_LANGUAGES } from "../i18n/languages";
import { LanguageModal } from "../ui/LanguageModal";
import type { RootStackParamList } from "../navigation/types";
import { AppText, Banner, Card, Field, ListRow, Row, Screen, Stack } from "../ui/components";
import { ErrorState, LoadingState } from "../ui/states";
import { colors, space } from "../ui/theme";

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

async function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await p };
  } catch (error) {
    return { ok: false, error };
  }
}

export function DashboardScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { language, t } = useLanguage();
  const [langModalVisible, setLangModalVisible] = useState(false);
  const res = useResource(async (signal) => {
    const [patient, prescriptions, schedules, appointments] = await Promise.all([
      settle(patientApi.me(signal)),
      settle(prescriptionApi.list(signal)),
      settle(medicationApi.list(signal)),
      settle(appointmentApi.list(signal)),
    ]);
    return { patient, prescriptions, schedules, appointments };
  });

  const d = res.data;
  // If the core profile call failed, the whole screen can't be trusted: show one retryable error.
  if (res.loading) return <Screen><LoadingState label="Loading your dashboard…" /></Screen>;
  if (res.error || !d) return <Screen><ErrorState error={res.error} onRetry={res.reload} /></Screen>;
  if (!d.patient.ok) return <Screen><ErrorState error={d.patient.error} onRetry={res.reload} /></Screen>;

  const patient = d.patient.value;
  const rx = d.prescriptions.ok ? d.prescriptions.value.items : null;
  const attention = rx
    ? {
        review: rx.filter((p) => p.verificationStatus === "needs_review" || p.verificationStatus === "unverified").length,
        failed: rx.filter((p) => p.processingStatus === "failed").length,
        working: rx.filter((p) => p.processingStatus === "pending" || p.processingStatus === "processing").length,
      }
    : null;
  const reminder = d.schedules.ok ? nextReminder(d.schedules.value.items) : null;
  const appt = d.appointments.ok ? nextAppointment(d.appointments.value.items) : null;

  return (
    <Screen refreshing={res.refreshing} onRefresh={res.refresh}>
      <Stack>
        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <AppText variant="caption" muted>BHARAT DIGITAL HEALTH MISSION</AppText>
          </View>
          <TouchableOpacity
            onPress={() => setLangModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Change regional language"
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: space.sm,
              paddingVertical: 5,
              borderRadius: 16,
              gap: 6,
            }}
          >
            <Feather name="globe" size={13} color={colors.primary} />
            <AppText variant="caption" style={{ fontWeight: "700", color: colors.primary }}>
              {SUPPORTED_LANGUAGES.find((l) => l.code === language)?.nativeName ?? "English"}
            </AppText>
            <Feather name="chevron-down" size={13} color={colors.textMuted} />
          </TouchableOpacity>
        </Row>

        <Card style={{ backgroundColor: colors.primary, borderColor: colors.primary }}>
          <AppText variant="caption" color="#c9d6e4">
            Your Sehat Med ID
          </AppText>
          <AppText variant="title" color={colors.onPrimary} selectable accessibilityLabel={`Your Sehat Med ID is ${patient.healthId}`}>
            {patient.healthId}
          </AppText>
          <AppText variant="small" color="#c9d6e4">
            {patient.fullName ? patient.fullName : "Add your name in Profile"}
          </AppText>
        </Card>

        {!patient.fullName || !patient.dateOfBirth ? (
          <Banner tone="info" title="Your profile is incomplete" icon="user">
            Add your name and date of birth so your health card is useful.
          </Banner>
        ) : null}

        {attention && (attention.review > 0 || attention.failed > 0 || attention.working > 0) ? (
          <Stack gap={space.sm}>
            {attention.review > 0 ? (
              <Banner tone="warning" title={`${attention.review} prescription${attention.review > 1 ? "s" : ""} not yet verified`} icon="search">
                Check the details against your paper prescription.
              </Banner>
            ) : null}
            {attention.failed > 0 ? (
              <Banner tone="danger" title={`${attention.failed} prescription${attention.failed > 1 ? "s" : ""} couldn't be read`} icon="alert-triangle">
                Open it to try again or enter the details yourself.
              </Banner>
            ) : null}
            {attention.working > 0 ? (
              <Banner tone="info" title={`${attention.working} prescription${attention.working > 1 ? "s" : ""} waiting or being read`} icon="clock" />
            ) : null}
          </Stack>
        ) : null}

        <Card>
          <AppText variant="heading">Next up</AppText>
          {d.schedules.ok ? (
            reminder ? (
              <Field label="Next medicine reminder" value={`${formatDateTime(reminder.at.toISOString())} · ${reminder.medicationName}`} />
            ) : (
              <AppText muted>No reminders set. Reminders appear once a schedule has reminder times turned on.</AppText>
            )
          ) : (
            <AppText muted>Reminders couldn't be loaded. Pull down to retry.</AppText>
          )}
          {d.appointments.ok ? (
            appt ? (
              <Field label="Next appointment" value={`${formatDateTime(appointmentStart(appt))} · ${appointmentHospitalName(appt)}`} />
            ) : (
              <AppText muted>No upcoming appointments.</AppText>
            )
          ) : (
            <AppText muted>Appointments couldn't be loaded. Pull down to retry.</AppText>
          )}
        </Card>

        <Card style={{ gap: 0 }}>
          <ListRow title={t("prescriptions", "Upload a prescription")} subtitle="Photo or PDF" onPress={() => nav.navigate("PrescriptionUpload")} />
          <ListRow title={t("symptom_checker", "AI Symptom Checker")} subtitle="Clinical triage & emergency screening" onPress={() => nav.navigate("SymptomChecker")} />
          <ListRow title={t("insurance", "Health Insurance")} subtitle="Policy vault & cashless helplines" onPress={() => nav.navigate("Insurance")} />
          <ListRow title={t("payments", "Consultation Payments")} subtitle="Pay consultation fees & receipts" onPress={() => nav.navigate("Payments")} />
          <ListRow title={t("history", "Medical history")} onPress={() => nav.navigate("History")} />
          <ListRow title={t("health_card", "Digital health card and QR")} onPress={() => nav.navigate("HealthCard")} />
        </Card>

        <LanguageModal visible={langModalVisible} onClose={() => setLangModalVisible(false)} />
      </Stack>
    </Screen>
  );
}
