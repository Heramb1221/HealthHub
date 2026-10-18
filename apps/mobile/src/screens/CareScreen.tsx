import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import { Alert } from "react-native";

import { appointmentApi, hospitalApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { Appointment } from "../api/types";
import { useResource } from "../hooks/useResource";
import { appointmentHospitalName, appointmentStart } from "../lib/appointments";
import { filterHospitals, groupAppointments } from "../lib/filter";
import { formatDateTime } from "../lib/format";
import type { RootStackParamList } from "../navigation/types";
import { AppText, Badge, Banner, Button, Card, Chip, DemoTag, ListRow, Row, Screen, Stack, TextField } from "../ui/components";
import { EmptyState, ErrorState, LoadingState } from "../ui/states";

export function CareScreen() {
  const [tab, setTab] = useState<"hospitals" | "appointments">("hospitals");
  return (
    <Screen>
      <Stack>
        <Row>
          <Chip label="Hospitals" selected={tab === "hospitals"} onPress={() => setTab("hospitals")} />
          <Chip label="My appointments" selected={tab === "appointments"} onPress={() => setTab("appointments")} />
        </Row>
        {tab === "hospitals" ? <HospitalList /> : <AppointmentList />}
      </Stack>
    </Screen>
  );
}

function HospitalList() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const res = useResource((signal) => hospitalApi.list(signal));
  const [query, setQuery] = useState("");
  if (res.loading) return <LoadingState label="Loading hospitals…" />;
  if (res.error && !res.data) return <ErrorState error={res.error} onRetry={res.reload} />;
  const items = (res.data?.items ?? []).filter((h) => h.isActive !== false);
  if (items.length === 0) return <EmptyState icon="map-pin" title="No hospitals listed" body="The hospital directory is empty right now." />;
  const shown = filterHospitals(items, query);
  return (
    <Stack gap={0}>
      {items.some((h) => h.isDemo) ? <Banner tone="demo" title="Demo directory" icon="info">Hospitals marked "Demo data" are sample entries, not real providers.</Banner> : null}
      <TextField label="Search hospitals" value={query} onChangeText={setQuery} hint="Search by name, city or specialty" autoCapitalize="none" autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing" />
      {shown.length === 0 ? <EmptyState icon="search" title="No matches" body={`No hospitals match "${query.trim()}". Try a different name, city or specialty.`} action={{ label: "Clear search", onPress: () => setQuery("") }} /> : null}
      {shown.map((h) => (
        <Card key={h.id} style={{ marginTop: 12 }}>
          <ListRow
            title={h.name}
            subtitle={[h.city, h.specialties?.join(", ")].filter(Boolean).join(" · ") || undefined}
            onPress={() => nav.navigate("Hospital", { id: h.id })}
            accessibilityLabel={`${h.name}${h.isDemo ? ", demo data" : ""}. View details and appointments`}
          />
          {h.isDemo ? <DemoTag /> : null}
        </Card>
      ))}
    </Stack>
  );
}

function AppointmentList() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const res = useResource((signal) => appointmentApi.list(signal));
  const [updated, setUpdated] = useState<Record<string, Appointment>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (res.loading) return <LoadingState label="Loading appointments…" />;
  if (res.error && !res.data) return <ErrorState error={res.error} onRetry={res.reload} />;
  const items = (res.data?.items ?? []).map((a) => updated[a.id] ?? a);
  if (items.length === 0) return <EmptyState icon="calendar" title="No appointments" body="Choose a hospital to see available slots and book one." />;

  function confirmCancel(a: Appointment) {
    Alert.alert("Cancel this appointment?", `${appointmentHospitalName(a)} · ${formatDateTime(appointmentStart(a))}`, [
      { text: "Keep appointment", style: "cancel" },
      { text: "Cancel appointment", style: "destructive", onPress: () => void cancel(a) },
    ]);
  }

  async function cancel(a: Appointment) {
    setBusy(a.id);
    setError(null);
    try {
      const result = await appointmentApi.cancel(a.id);
      setUpdated((u) => ({ ...u, [a.id]: { ...a, ...(result ?? {}), status: result?.status ?? "cancelled" } }));
    } catch (e) {
      const info = describeError(e);
      setError(`${info.title}. ${info.detail}`);
    } finally {
      setBusy(null);
    }
  }

  const { upcoming, past } = groupAppointments(items);
  const renderAppt = (a: Appointment) => (
        <Card key={a.id}>
          <AppText variant="label">{appointmentHospitalName(a)}</AppText>
          <AppText>{appointmentStart(a) ? formatDateTime(appointmentStart(a)) : "Time not provided"}</AppText>
          <Row style={{ flexWrap: "wrap" }}>
            <Badge label={a.status === "confirmed" ? "Confirmed" : "Cancelled"} tone={a.status === "confirmed" ? "success" : "neutral"} icon={a.status === "confirmed" ? "check-circle" : "x-circle"} />
            {a.hospital?.isDemo ? <DemoTag /> : null}
          </Row>
          {a.hospital?.id ? (
            <Button
              label="Hospital details & slots"
              variant="secondary"
              icon="map-pin"
              onPress={() => nav.navigate("Hospital", { id: a.hospital.id })}
            />
          ) : null}
          {a.status === "confirmed" && upcoming.includes(a) ? <Button label="Cancel appointment" variant="danger" onPress={() => confirmCancel(a)} loading={busy === a.id} /> : null}
        </Card>
  );
  return (
    <Stack>
      {error ? <Banner tone="danger" title={error} icon="alert-circle" /> : null}
      <AppText variant="heading" accessibilityRole="header">Upcoming</AppText>
      {upcoming.length === 0 ? <AppText muted>No upcoming appointments. Choose a hospital to book one.</AppText> : upcoming.map(renderAppt)}
      {past.length > 0 ? <AppText variant="heading" accessibilityRole="header">Past and cancelled</AppText> : null}
      {past.map(renderAppt)}
    </Stack>
  );
}
