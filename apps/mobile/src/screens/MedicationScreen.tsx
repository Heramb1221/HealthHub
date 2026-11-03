import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useState } from "react";

import { medicationApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { DoseStatus, MedicationSchedule } from "../api/types";
import { useResource } from "../hooks/useResource";
import { formatDateOnly, formatDateTime } from "../lib/format";
import {
  cancelLocalReminders,
  getReminderPermission,
  requestReminderPermission,
  syncLocalReminders,
  type ReminderPermission,
} from "../lib/reminders";
import { loadReminderSettings, setRemindersEnabled, setShowMedicineNames } from "../lib/reminderSettings";
import { doseSlots, planReminders, scheduleZone, type DoseSlot } from "../lib/schedule";
import { isValidDateOnly, isValidTimeOfDay, listToText, parseList } from "../lib/validation";
import { sendWhatsAppReminder } from "../lib/whatsapp";
import { useLanguage } from "../i18n/LanguageContext";
import type { RootStackParamList } from "../navigation/types";
import { Feather } from "@expo/vector-icons";
import { View } from "react-native";

import { AppText, Badge, Banner, Button, Card, Divider, Row, Screen, SectionTitle, Stack, TextField } from "../ui/components";
import { EmptyState, ErrorState, LoadingState, PermissionDenied } from "../ui/states";
import { colors, radius, space } from "../ui/theme";

export function MedicationScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const res = useResource((signal) => medicationApi.list(signal));
  const [updated, setUpdated] = useState<Record<string, MedicationSchedule>>({});

  const schedules = (res.data?.items ?? []).map((s) => updated[s.id] ?? s);

  if (res.loading) return <Screen><LoadingState label="Loading your medicine schedule…" /></Screen>;
  if (res.error && !res.data) return <Screen><ErrorState error={res.error} onRetry={res.reload} /></Screen>;

  return (
    <Screen refreshing={res.refreshing} onRefresh={() => { setUpdated({}); res.refresh(); }}>
      <Stack>
        <Banner tone="info" title="You record your own doses" icon="info">
          "Taken" and "Skipped" are self-reported. Sehat Meds does not check them and does not give medical advice.
        </Banner>
        <Button
          label="Add a medicine to schedule"
          icon="plus"
          onPress={() => nav.navigate("AddSchedule")}
        />
        <LocalReminders schedules={schedules} />
        {schedules.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No medicine schedules yet"
            body="Choose a medicine from your reviewed prescriptions to set up a reminder schedule."
            action={{ label: "Add a medicine", onPress: () => nav.navigate("AddSchedule") }}
          />
        ) : (
          schedules.map((s) => <ScheduleCard key={s.id} schedule={s} onUpdated={(n) => setUpdated((u) => ({ ...u, [n.id]: n }))} />)
        )}
      </Stack>
    </Screen>
  );
}

function ScheduleCard({ schedule, onUpdated }: { schedule: MedicationSchedule; onUpdated: (s: MedicationSchedule) => void }) {
  const { t } = useLanguage();
  const [reported, setReported] = useState<Record<string, DoseStatus>>({});
  const [busyTime, setBusyTime] = useState<string | null>(null);
  const [doseError, setDoseError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [timesText, setTimesText] = useState(listToText(schedule.reminderTimes));
  const [endDateText, setEndDateText] = useState(schedule.endDate ?? "");
  const [enabled, setEnabled] = useState(schedule.remindersEnabled);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const med = schedule.medication;
  const zone = scheduleZone(schedule);
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Slots are computed in the schedule's own time zone (daylight-saving aware), not the phone's.
  const slots = doseSlots(schedule).filter((slot) => slot.day === "today" || slot.missed || slot.status);
  const doseStatusFor = (slot: DoseSlot): DoseStatus | undefined => reported[slot.iso] ?? slot.status;

  async function toggleActive() {
    setToggling(true);
    setToggleError(null);
    try {
      onUpdated(await medicationApi.update(schedule.id, { isActive: !schedule.isActive }));
    } catch (error) {
      const info = describeError(error);
      setToggleError(`${info.title}. ${info.detail}`);
    } finally {
      setToggling(false);
    }
  }

  const badTimes = parseList(timesText).filter((t) => !isValidTimeOfDay(t));
  const timesError = badTimes.length ? `Use 24-hour HH:mm, for example 08:00. Not valid: ${badTimes.join(", ")}` : null;
  const endDateError =
    endDateText && (!isValidDateOnly(endDateText) || endDateText < schedule.startDate)
      ? "End date must be on or after start date (YYYY-MM-DD)"
      : null;

  async function report(slot: DoseSlot, status: DoseStatus) {
    if (busyTime) return;
    setBusyTime(`${slot.iso}:${status}`);
    setDoseError(null);
    try {
      const event = await medicationApi.reportDose(schedule.id, { scheduledFor: slot.iso, status });
      // Show what the record really says (a repeat of an earlier answer returns that answer).
      setReported((r) => ({ ...r, [slot.iso]: event?.status ?? status }));
    } catch (error) {
      const info = describeError(error);
      setDoseError(`${info.title}. ${info.detail}`);
    } finally {
      setBusyTime(null);
    }
  }

  async function save() {
    if (timesError || endDateError) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await medicationApi.update(schedule.id, {
        remindersEnabled: enabled,
        reminderTimes: parseList(timesText).sort(),
        endDate: endDateText ? endDateText : null,
      });
      onUpdated(next);
      setEditing(false);
    } catch (error) {
      const info = describeError(error);
      setSaveError(`${info.title}. ${info.detail}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Row style={{ alignItems: "flex-start" }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.iconTile, alignItems: "center", justifyContent: "center" }} importantForAccessibility="no">
          <Feather name="package" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading" accessibilityRole="header">{med.name ?? "Medicine"}</AppText>
          <AppText>{[med.strength, med.dose, med.frequency].filter(Boolean).join(" · ")}</AppText>
        </View>
      </Row>
      <AppText variant="caption" muted>Copied from your prescription record (version {schedule.sourceVersionNumber}). It can't be edited here.</AppText>
      {schedule.sourceStatus !== "current" ? (
        <Banner tone="warning" title={schedule.sourceStatus === "removed" ? "This medicine was removed from the prescription" : "The prescription now says something different"} icon="alert-triangle">
          Reminders for this schedule are paused. Check the prescription and make a new schedule if it still applies.
        </Banner>
      ) : null}
      <AppText variant="small" muted>
        From {formatDateOnly(schedule.startDate)}{schedule.endDate ? ` to ${formatDateOnly(schedule.endDate)}` : ""}
      </AppText>
      {!schedule.isActive ? <Badge label="Not active" tone="neutral" icon="pause-circle" /> : null}
      <Divider />

      {editing ? (
        <Stack gap={space.md}>
          <Button
            label={enabled ? "Reminders on (tap to turn off)" : "Reminders off (tap to turn on)"}
            variant="secondary"
            icon={enabled ? "bell" : "bell-off"}
            onPress={() => setEnabled((v) => !v)}
          />
          <TextField label="Reminder times" value={timesText} onChangeText={setTimesText} error={timesError} hint="24-hour times separated by commas, for example 08:00, 20:00" autoCapitalize="none" />
          <TextField label="End date (optional)" value={endDateText} onChangeText={setEndDateText} error={endDateError} hint="YYYY-MM-DD, or leave blank for ongoing" keyboardType="numbers-and-punctuation" />
          {saveError ? <Banner tone="danger" title={saveError} icon="alert-circle" /> : null}
          <Button label="Save reminder settings" onPress={() => void save()} loading={saving} disabled={Boolean(timesError || endDateError)} />
          <Button label="Cancel" variant="ghost" onPress={() => { setEditing(false); setEndDateText(schedule.endDate ?? ""); }} disabled={saving} />
        </Stack>
      ) : (
        <>
          <Row>
            <Badge label={schedule.remindersEnabled ? "Reminders on" : "Reminders off"} tone={schedule.remindersEnabled ? "success" : "neutral"} icon={schedule.remindersEnabled ? "bell" : "bell-off"} />
          </Row>
          {schedule.reminderTimes.length === 0 ? (
            <AppText variant="small" muted>No reminder times set.</AppText>
          ) : (
            <Stack gap={space.sm}>
              <AppText variant="label">Doses (self-report)</AppText>
              {zone !== deviceZone ? <AppText variant="caption" muted>Times are in {zone}, the zone this reminder was set up in.</AppText> : null}
              {slots.map((slot) => {
                const done = doseStatusFor(slot);
                const label = `${slot.day === "yesterday" ? "Yesterday " : ""}${slot.time}`;
                return (
                  <Row key={slot.iso} style={{ justifyContent: "space-between", flexWrap: "wrap", paddingVertical: space.xs }}>
                    <AppText variant="label">{label}</AppText>
                    {done ? (
                      <Badge label={`You marked ${done}`} tone={done === "taken" ? "success" : "neutral"} icon={done === "taken" ? "check" : "skip-forward"} />
                    ) : !slot.canRecord ? (
                      <Badge label="Not due yet" tone="neutral" icon="clock" />
                    ) : (
                      <Row style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {slot.missed ? <Badge label="Not recorded" tone="warning" icon="alert-circle" /> : null}
                        <Button
                          label="WhatsApp"
                          variant="ghost"
                          icon="share-2"
                          onPress={() => void sendWhatsAppReminder({
                            medicationName: med.name || "Medicine",
                            dosage: med.dose || med.strength || "1 dose",
                            timeStr: slot.time,
                            instructions: med.frequency || undefined,
                          })}
                          accessibilityHint={`Share ${med.name || "medicine"} reminder via WhatsApp`}
                        />
                        <Button label={t("take_dose", "Taken")} variant="secondary" onPress={() => void report(slot, "taken")} loading={busyTime === `${slot.iso}:taken`} disabled={busyTime !== null} accessibilityHint={`Record that you took the ${label} dose`} />
                        <Button label={t("skip_dose", "Skipped")} variant="ghost" onPress={() => void report(slot, "skipped")} loading={busyTime === `${slot.iso}:skipped`} disabled={busyTime !== null} accessibilityHint={`Record that you skipped the ${label} dose`} />
                      </Row>
                    )}
                  </Row>
                );
              })}
            </Stack>
          )}
          {doseError ? <Banner tone="danger" title={doseError} icon="alert-circle" /> : null}
          {schedule.recentDoseEvents.length > 0 ? (
            <Stack gap={space.xs}>
              <AppText variant="label">Recent doses you recorded</AppText>
              {schedule.recentDoseEvents.slice(0, 5).map((e) => (
                <AppText key={e.id} variant="small" muted>{formatDateTime(e.scheduledFor)} · {e.status === "taken" ? "Taken" : "Skipped"} (self-reported)</AppText>
              ))}
              <AppText variant="caption" muted>A recorded dose can't be changed or removed yet.</AppText>
            </Stack>
          ) : null}
          <AppText variant="caption" muted>{schedule.notice}</AppText>
          {toggleError ? <Banner tone="danger" title={toggleError} icon="alert-circle" /> : null}
          <Button label={schedule.isActive ? "Stop this schedule" : "Resume this schedule"} variant="ghost" icon={schedule.isActive ? "pause-circle" : "play-circle"} onPress={() => void toggleActive()} loading={toggling} />
          <Button label="Edit reminders" variant="secondary" icon="edit-2" onPress={() => { setTimesText(listToText(schedule.reminderTimes)); setEnabled(schedule.remindersEnabled); setEditing(true); }} />
        </>
      )}
    </Card>
  );
}

function LocalReminders({ schedules }: { schedules: MedicationSchedule[] }) {
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [showNames, setShowNames] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [scheduled, setScheduled] = useState<{ count: number; next: Date | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const eligible = planReminders(schedules).length;

  // Load what the patient chose last time, and the current permission.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [settings, perm] = [await loadReminderSettings(), await getReminderPermission()];
      if (cancelled) return;
      setEnabled(settings.enabled);
      setShowNames(settings.showMedicineNames);
      setPermission(perm);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the phone in step with the schedules whenever they change (edit, pause, end date, new medicine): the
  // phone's pending reminders are made to match exactly, so nothing stale keeps firing and nothing is duplicated.
  useEffect(() => {
    if (!loaded || !enabled || permission !== "granted") return;
    let cancelled = false;
    syncLocalReminders(schedules, { showMedicineNames: showNames })
      .then((r) => !cancelled && setScheduled({ count: r.scheduled, next: r.next }))
      .catch(() => !cancelled && setMessage("Couldn't update the reminders on this phone. Try turning them off and on again."));
    return () => {
      cancelled = true;
    };
  }, [loaded, enabled, permission, schedules, showNames]);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      let perm = await getReminderPermission();
      if (perm !== "granted") perm = await requestReminderPermission();
      setPermission(perm);
      if (perm !== "granted") return;
      await setRemindersEnabled(true);
      setEnabled(true);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    await setRemindersEnabled(false);
    await cancelLocalReminders();
    setEnabled(false);
    setScheduled(null);
    setMessage("Reminders on this phone are turned off.");
    setBusy(false);
  }

  async function toggleNames() {
    const next = !showNames;
    setShowNames(next);
    await setShowMedicineNames(next);
    if (enabled && permission === "granted") {
      try {
        await syncLocalReminders(schedules, { showMedicineNames: next, force: true });
      } catch {
        setMessage("Couldn't update the reminders on this phone.");
      }
    }
  }

  const permissionBlocked = permission === "denied" || permission === "unavailable";
  return (
    <Card>
      <Row style={{ flexWrap: "wrap", justifyContent: "space-between" }}>
        <SectionTitle>Reminders on this phone</SectionTitle>
        <Badge label="This phone only" tone="demo" icon="info" />
      </Row>
      <AppText variant="small" muted>
        These are set on this phone only; the Sehat Meds server doesn't send them. They cover about the next two weeks and refresh whenever you open the app, so they can stop if you don't open it for a long time, if notifications are off, or if your phone limits background activity. Don't rely on them alone for essential doses.
      </AppText>
      {permission === "denied" ? <PermissionDenied what="Notification" why="Turn notifications on in Settings to use reminders on this phone." /> : null}
      {permission === "unavailable" ? <Banner tone="warning" title="This device can't show reminders" icon="alert-triangle">Notifications aren't available here. Use your calendar or the website instead.</Banner> : null}
      {eligible === 0 && !enabled ? (
        <AppText variant="small" color={colors.textMuted}>Add reminder times to a medicine and turn its reminders on first.</AppText>
      ) : enabled && !permissionBlocked ? (
        <>
          <AppText variant="small" accessibilityLiveRegion="polite">
            {scheduled
              ? scheduled.count === 0
                ? "On, but there are no upcoming doses to remind you about."
                : `On: ${scheduled.count} upcoming dose${scheduled.count > 1 ? "s" : ""} scheduled${scheduled.next ? `, next ${formatDateTime(scheduled.next.toISOString())}` : ""}.`
              : "Setting up…"}
          </AppText>
          <Button label="Turn off reminders on this phone" variant="secondary" icon="bell-off" onPress={() => void turnOff()} loading={busy} />
        </>
      ) : !permissionBlocked ? (
        <Button label="Turn on reminders on this phone" variant="secondary" icon="bell" onPress={() => void turnOn()} loading={busy || !loaded} />
      ) : null}
      <Button
        label={showNames ? "Hide medicine names in notifications" : "Show medicine names in notifications"}
        variant="ghost"
        icon={showNames ? "eye-off" : "eye"}
        onPress={() => void toggleNames()}
        accessibilityHint="Medicine names would be visible on your lock screen"
      />
      <AppText variant="caption" muted>
        {showNames ? "Notifications now show the medicine name, which anyone near your phone can read on the lock screen." : "Notifications don't show medicine names, so they stay private on your lock screen."}
      </AppText>
      {message ? <AppText variant="small" accessibilityLiveRegion="polite">{message}</AppText> : null}
    </Card>
  );
}
