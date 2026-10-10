import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { Alert, Linking } from "react-native";

import { appointmentApi, hospitalApi } from "../api/endpoints";
import { describeError, isApiError } from "../api/errors";
import type { Appointment, AvailabilitySlot } from "../api/types";
import { useResource } from "../hooks/useResource";
import { formatDateTime, formatDayHeading, formatTimeOnly, localDayKey, orDash } from "../lib/format";
import type { RootStackParamList } from "../navigation/types";
import { AppText, Banner, Button, Card, Chip, DemoTag, Field, Row, Screen, Stack } from "../ui/components";
import { EmptyState, ErrorState, LoadingState } from "../ui/states";
import { space } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Hospital">;

export function HospitalScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const hospital = useResource((signal) => hospitalApi.get(id, signal));
  const slots = useResource((signal) => hospitalApi.availability(id, signal));
  const [selected, setSelected] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Appointment | null>(null);

  const grouped = useMemo(() => {
    const open = (slots.data?.items ?? []).filter((s) => s.status === "open" && new Date(s.startsAt).getTime() > Date.now());
    const map = new Map<string, AvailabilitySlot[]>();
    for (const s of open.sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const key = localDayKey(s.startsAt);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [slots.data]);

  // Drop a selection that is no longer offered after a refresh.
  useEffect(() => {
    if (selected && !(slots.data?.items ?? []).some((s) => s.id === selected && s.status === "open")) setSelected(null);
  }, [slots.data, selected]);

  if (hospital.loading) return <Screen><LoadingState label="Loading hospital…" /></Screen>;
  if (hospital.error && !hospital.data) return <Screen><ErrorState error={hospital.error} onRetry={hospital.reload} /></Screen>;
  const h = hospital.data;
  if (!h) return null;
  const chosen = (slots.data?.items ?? []).find((s) => s.id === selected);

  function confirmBooking() {
    if (!chosen) return;
    Alert.alert("Book this appointment?", `${h?.name ?? "Hospital"}\n${formatDateTime(chosen.startsAt)}`, [
      { text: "Not yet", style: "cancel" },
      { text: "Book", onPress: () => void book(chosen.id) },
    ]);
  }

  async function book(slotId: string) {
    setBooking(true);
    setError(null);
    try {
      setBooked(await appointmentApi.book({ slotId }));
      setSelected(null);
      await slots.reload();
    } catch (e) {
      if (isApiError(e) && e.code === "CONFLICT") {
        setError("Someone else just booked that slot. Choose another time.");
        setSelected(null);
        await slots.reload();
      } else {
        const info = describeError(e);
        setError(`${info.title}. ${info.detail}`);
      }
    } finally {
      setBooking(false);
    }
  }

  return (
    <Screen refreshing={slots.refreshing} onRefresh={() => { hospital.reload(); slots.refresh(); }}>
      <Stack>
        <Card>
          <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <AppText variant="heading" accessibilityRole="header">{h.name}</AppText>
            {h.isDemo ? <DemoTag /> : null}
          </Row>
          <Field label="Address" value={[h.address, h.city].filter(Boolean).join(", ") || "Not provided"} />
          <Field label="Specialties" value={h.specialties?.length ? h.specialties.join(", ") : "Not provided"} />
          <Field label="Phone" value={orDash(h.phone)} />
          {h.phone ? <Button label="Call hospital" icon="phone" variant="secondary" onPress={() => void Linking.openURL(`tel:${h.phone}`)} /> : null}
        </Card>

        {booked ? (
          <Banner tone="success" title="Appointment confirmed" icon="check-circle">
            {booked.slot?.startsAt ?? booked.startsAt ? formatDateTime(booked.slot?.startsAt ?? booked.startsAt) : "See My appointments for details."}
          </Banner>
        ) : null}
        {booked ? <Button label="View my appointments" variant="secondary" onPress={() => navigation.navigate("Tabs", { screen: "Care" })} /> : null}
        {error ? <Banner tone="danger" title={error} icon="alert-circle" /> : null}

        <AppText variant="heading" accessibilityRole="header">Available times</AppText>
        {h.isDemo ? <AppText variant="small" muted>Demo slots for testing. No real appointment is made and no payment is taken.</AppText> : null}
        {slots.loading ? (
          <LoadingState label="Loading available times…" />
        ) : slots.error && !slots.data ? (
          <ErrorState error={slots.error} onRetry={slots.reload} />
        ) : grouped.length === 0 ? (
          <EmptyState icon="calendar" title="No open times" body="There are no open slots right now. Check again later." />
        ) : (
          grouped.map(([day, daySlots]) => (
            <Stack key={day} gap={space.sm}>
              <AppText variant="label">{formatDayHeading(day)}</AppText>
              <Row style={{ flexWrap: "wrap" }}>
                {daySlots.map((s) => (
                  <Chip key={s.id} label={formatTimeOnly(s.startsAt)} selected={selected === s.id} onPress={() => setSelected(s.id)} />
                ))}
              </Row>
            </Stack>
          ))
        )}
        <Button label={chosen ? `Book ${formatTimeOnly(chosen.startsAt)}` : "Select a time to book"} onPress={confirmBooking} disabled={!chosen} loading={booking} />
      </Stack>
    </Screen>
  );
}
