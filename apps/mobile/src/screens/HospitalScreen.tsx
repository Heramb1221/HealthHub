import { Feather } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, TextInput, TouchableOpacity, View } from "react-native";

import { appointmentApi, hospitalApi } from "../api/endpoints";
import { describeError, isApiError } from "../api/errors";
import type { Appointment, AvailabilitySlot } from "../api/types";
import { useResource } from "../hooks/useResource";
import { formatDateTime, formatDayHeading, formatTimeOnly, localDayKey, orDash } from "../lib/format";
import type { RootStackParamList } from "../navigation/types";
import { AppText, Badge, Banner, Button, Card, Chip, DemoTag, Field, Row, Screen, Stack } from "../ui/components";
import { EmptyState, ErrorState, LoadingState } from "../ui/states";
import { colors, radius, space } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Hospital">;

function getSessionPeriod(date: Date): "Morning" | "Afternoon" | "Evening" {
  const hours = date.getHours();
  if (hours < 13) return "Morning";
  if (hours < 17) return "Afternoon";
  return "Evening";
}

export function HospitalScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const hospital = useResource((signal) => hospitalApi.get(id, signal));
  const slots = useResource(async (signal) => ({ page: await hospitalApi.availability(id, signal), fetchedAt: Date.now() }));
  const reviews = useResource((signal) => hospitalApi.reviews(id, signal));
  const [selected, setSelected] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Appointment | null>(null);

  // Rating & Review State
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [userRating, setUserRating] = useState<number>(5);
  const [userComment, setUserComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Auto-poll availability every 4 seconds for live concurrency updates
  const reloadSlots = slots.reload;
  useEffect(() => {
    const timer = setInterval(() => {
      void reloadSlots();
    }, 4000);
    return () => clearInterval(timer);
  }, [reloadSlots]);

  // Hold Countdown
  useEffect(() => {
    if (!holdExpiresAt || !selected) {
      return;
    }
    const target = new Date(holdExpiresAt).getTime();
    const computeDiff = () => Math.max(0, Math.ceil((target - Date.now()) / 1000));

    const interval = setInterval(() => {
      const diff = computeDiff();
      setSecondsRemaining(diff);
      if (diff <= 0) {
        clearInterval(interval);
        setSelected(null);
        setHoldExpiresAt(null);
        void reloadSlots();
      }
    }, 1000);

    const initial = setTimeout(() => {
      setSecondsRemaining(computeDiff());
    }, 0);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [holdExpiresAt, selected, reloadSlots]);

  const activeHoldSeconds = holdExpiresAt && selected ? secondsRemaining : null;

  const grouped = useMemo(() => {
    const fetchedAt = slots.data?.fetchedAt ?? 0;
    const items = (slots.data?.page.items ?? []).filter((s) => new Date(s.startsAt).getTime() > fetchedAt);
    const map = new Map<string, AvailabilitySlot[]>();
    for (const s of items.sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const key = localDayKey(s.startsAt);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [slots.data]);

  if (hospital.loading) return <Screen><LoadingState label="Loading hospital…" /></Screen>;
  if (hospital.error && !hospital.data) return <Screen><ErrorState error={hospital.error} onRetry={hospital.reload} /></Screen>;
  const h = hospital.data;
  if (!h) return null;

  const chosen = (slots.data?.page.items ?? []).find((s) => s.id === selected);

  async function handleSlotPress(slot: AvailabilitySlot) {
    if (slot.status === "booked") return;
    if (slot.status === "holding" && slot.id !== selected) {
      Alert.alert("Slot Locked", "This slot is currently held by another patient. Try another time or wait 5 minutes.");
      return;
    }

    if (selected === slot.id) {
      // Deselect
      try {
        await hospitalApi.releaseSlot(id, slot.id);
      } catch {
        // Ignore
      }
      setSelected(null);
      setHoldExpiresAt(null);
      await slots.reload();
      return;
    }

    try {
      const res = await hospitalApi.holdSlot(id, slot.id);
      setSelected(slot.id);
      setHoldExpiresAt(res.expiresAt);
      await slots.reload();
    } catch (e) {
      const info = describeError(e);
      Alert.alert("Unavailable", `${info.title}. ${info.detail}`);
      await slots.reload();
    }
  }

  function confirmBooking() {
    if (!chosen) return;
    Alert.alert("Confirm Appointment?", `${h?.name ?? "Hospital"}\n${formatDateTime(chosen.startsAt)} (15-min OPD)\nFee: ₹500`, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: () => void book(chosen.id) },
    ]);
  }

  async function book(slotId: string) {
    setBooking(true);
    setError(null);
    try {
      setBooked(await appointmentApi.book({ slotId }));
      setSelected(null);
      setHoldExpiresAt(null);
      await slots.reload();
    } catch (e) {
      if (isApiError(e) && e.code === "CONFLICT") {
        setError("Someone else just booked or held that slot. Please choose another time.");
        setSelected(null);
        setHoldExpiresAt(null);
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
          {reviews.data?.ratingAverage ? (
            <Row style={{ alignItems: "center", gap: space.xs }}>
              <Feather name="star" size={16} color="#d97706" />
              <AppText variant="label" style={{ fontWeight: "700" }}>
                {reviews.data.ratingAverage.toFixed(1)}
              </AppText>
              <AppText variant="caption" muted>
                ({reviews.data.reviewCount} {reviews.data.reviewCount === 1 ? "rating" : "ratings"}) · Verified Patients
              </AppText>
            </Row>
          ) : null}
          <Field label="Address" value={[h.address, h.city].filter(Boolean).join(", ") || "Not provided"} />
          {h.timings ? <Field label="Timings" value={h.timings} /> : null}
          <Field label="Specialties" value={h.specialties?.length ? h.specialties.join(", ") : "Not provided"} />
          <Field label="Phone" value={orDash(h.phone)} />
          <Stack gap={space.sm}>
            {h.phone ? <Button label="Call hospital" icon="phone" variant="secondary" onPress={() => void Linking.openURL(`tel:${h.phone}`)} /> : null}
            {h.locationUrl ? <Button label="View on Google Maps" icon="map-pin" variant="secondary" onPress={() => void Linking.openURL(h.locationUrl!)} /> : null}
            {h.website ? <Button label="Visit website" icon="external-link" variant="secondary" onPress={() => void Linking.openURL(h.website!)} /> : null}
          </Stack>
        </Card>

        {booked ? (
          <Banner tone="success" title="Appointment confirmed" icon="check-circle">
            {formatDateTime(booked.startsAt)} (15-min consultation booked)
          </Banner>
        ) : null}
        {booked ? <Button label="View my appointments" variant="secondary" onPress={() => navigation.navigate("Tabs", { screen: "Care" })} /> : null}
        {error ? <Banner tone="danger" title={error} icon="alert-circle" /> : null}

        {/* Live Reservation Hold Banner */}
        {selected && activeHoldSeconds !== null ? (
          <Banner tone="warning" title={`Slot held for you: ${Math.floor(activeHoldSeconds / 60)}:${String(activeHoldSeconds % 60).padStart(2, "0")}`} icon="clock">
            Complete booking below to confirm your consultation.
          </Banner>
        ) : null}

        <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
          <AppText variant="heading" accessibilityRole="header">15-Min Consultation Slots</AppText>
          <Badge label="Real-time grid" tone="info" icon="clock" />
        </Row>

        {slots.loading ? (
          <LoadingState label="Loading available times…" />
        ) : slots.error && !slots.data ? (
          <ErrorState error={slots.error} onRetry={slots.reload} />
        ) : grouped.length === 0 ? (
          <EmptyState icon="calendar" title="No open times" body="There are no open slots right now. Check again later." />
        ) : (
          grouped.map(([day, daySlots]) => {
            const morning = daySlots.filter((s) => getSessionPeriod(new Date(s.startsAt)) === "Morning");
            const afternoon = daySlots.filter((s) => getSessionPeriod(new Date(s.startsAt)) === "Afternoon");
            const evening = daySlots.filter((s) => getSessionPeriod(new Date(s.startsAt)) === "Evening");

            return (
              <Stack key={day} gap={space.md}>
                <AppText variant="label" style={{ fontWeight: "700" }}>{formatDayHeading(day)}</AppText>

                {morning.length > 0 ? (
                  <View style={{ gap: space.xs }}>
                    <AppText variant="small" muted>Morning OPD (09:00 AM – 01:00 PM)</AppText>
                    <Row style={{ flexWrap: "wrap", gap: space.xs }}>
                      {morning.map((s) => {
                        const isSel = selected === s.id;
                        const isHeldOther = s.status === "holding" && !isSel;
                        const isBooked = s.status === "booked";
                        return (
                          <Chip
                            key={s.id}
                            label={`${formatTimeOnly(s.startsAt)}${isBooked ? " (Booked)" : isHeldOther ? " (Locked)" : ""}`}
                            selected={isSel}
                            onPress={() => void handleSlotPress(s)}
                          />
                        );
                      })}
                    </Row>
                  </View>
                ) : null}

                {afternoon.length > 0 ? (
                  <View style={{ gap: space.xs }}>
                    <AppText variant="small" muted>Afternoon OPD (02:00 PM – 05:00 PM)</AppText>
                    <Row style={{ flexWrap: "wrap", gap: space.xs }}>
                      {afternoon.map((s) => {
                        const isSel = selected === s.id;
                        const isHeldOther = s.status === "holding" && !isSel;
                        const isBooked = s.status === "booked";
                        return (
                          <Chip
                            key={s.id}
                            label={`${formatTimeOnly(s.startsAt)}${isBooked ? " (Booked)" : isHeldOther ? " (Locked)" : ""}`}
                            selected={isSel}
                            onPress={() => void handleSlotPress(s)}
                          />
                        );
                      })}
                    </Row>
                  </View>
                ) : null}

                {evening.length > 0 ? (
                  <View style={{ gap: space.xs }}>
                    <AppText variant="small" muted>Evening Clinic (05:30 PM – 08:30 PM)</AppText>
                    <Row style={{ flexWrap: "wrap", gap: space.xs }}>
                      {evening.map((s) => {
                        const isSel = selected === s.id;
                        const isHeldOther = s.status === "holding" && !isSel;
                        const isBooked = s.status === "booked";
                        return (
                          <Chip
                            key={s.id}
                            label={`${formatTimeOnly(s.startsAt)}${isBooked ? " (Booked)" : isHeldOther ? " (Locked)" : ""}`}
                            selected={isSel}
                            onPress={() => void handleSlotPress(s)}
                          />
                        );
                      })}
                    </Row>
                  </View>
                ) : null}
              </Stack>
            );
          })
        )}

        {/* Bottom Floating Bar */}
        <Card style={{ marginTop: space.sm }}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <AppText variant="label">{chosen ? `Selected: ${formatTimeOnly(chosen.startsAt)}` : "Select a 15-min slot"}</AppText>
              <AppText variant="small" muted>₹500 consultation fee</AppText>
            </View>
            <Button
              label={chosen ? "Confirm & Book" : "Choose a slot"}
              onPress={confirmBooking}
              disabled={!chosen}
              loading={booking}
            />
          </Row>
        </Card>

        {/* Patient Ratings and Reviews Card */}
        <Card style={{ marginTop: space.md }}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <AppText variant="heading">Patient Ratings</AppText>
              <Row style={{ alignItems: "center", gap: space.xs, marginTop: space.xs }}>
                <Feather name="star" size={16} color="#d97706" />
                <AppText variant="label" style={{ fontWeight: "700" }}>
                  {reviews.data?.ratingAverage ? `${reviews.data.ratingAverage.toFixed(1)} / 5.0` : "No ratings yet"}
                </AppText>
                {reviews.data?.reviewCount ? (
                  <AppText variant="caption" muted>({reviews.data.reviewCount} reviews)</AppText>
                ) : null}
              </Row>
            </View>
            <Button
              label={showReviewForm ? "Close" : "Rate hospital"}
              variant="secondary"
              onPress={() => setShowReviewForm((v) => !v)}
            />
          </Row>

          {showReviewForm ? (
            <Stack gap={space.sm} style={{ backgroundColor: colors.background, padding: space.md, borderRadius: radius.md }}>
              <AppText variant="label">Select your rating</AppText>
              <Row style={{ gap: space.sm }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setUserRating(star)}
                    style={{
                      padding: space.sm,
                      borderRadius: radius.sm,
                      backgroundColor: userRating >= star ? colors.surface : colors.background,
                      borderWidth: 1,
                      borderColor: userRating >= star ? "#d97706" : colors.border,
                    }}
                  >
                    <Feather name="star" size={24} color={userRating >= star ? "#d97706" : colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </Row>

              <TextInput
                value={userComment}
                onChangeText={setUserComment}
                placeholder="Share your experience (optional)..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: radius.md,
                  padding: space.md,
                  minHeight: 80,
                  textAlignVertical: "top",
                  color: colors.text,
                }}
                maxLength={500}
              />

              <Button
                label="Submit rating"
                onPress={async () => {
                  setSubmittingReview(true);
                  try {
                    await hospitalApi.submitReview(id, {
                      rating: userRating,
                      reviewText: userComment.trim() || undefined,
                    });
                    Alert.alert("Success", "Your rating has been submitted!");
                    setShowReviewForm(false);
                    await reviews.reload();
                  } catch (err) {
                    const info = describeError(err);
                    Alert.alert(info.title, info.detail);
                  } finally {
                    setSubmittingReview(false);
                  }
                }}
                loading={submittingReview}
              />
            </Stack>
          ) : null}

          {/* List of reviews */}
          {reviews.data?.reviews && reviews.data.reviews.length > 0 ? (
            <Stack gap={space.md}>
              {reviews.data.reviews.map((r) => (
                <View key={r.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm, gap: 4 }}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Row style={{ gap: space.xs, alignItems: "center" }}>
                      <Row style={{ gap: 2 }}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Feather key={s} name="star" size={12} color={s <= r.rating ? "#d97706" : colors.border} />
                        ))}
                      </Row>
                      <AppText variant="caption" style={{ fontWeight: "600" }}>{r.patientName}</AppText>
                    </Row>
                    {r.isVerifiedPatient ? <Badge label="Verified Patient" tone="success" /> : null}
                  </Row>
                  {r.reviewText ? <AppText variant="small">{r.reviewText}</AppText> : null}
                </View>
              ))}
            </Stack>
          ) : (
            <AppText variant="small" muted>No reviews yet for this hospital.</AppText>
          )}
        </Card>
      </Stack>
    </Screen>
  );
}
