import { useEffect, useState } from "react";

import { medicationApi } from "../api/endpoints";
import { describeError } from "../api/errors";
import type { DoseStatus, MedicationSchedule } from "../api/types";
import { useResource } from "../hooks/useResource";
import { formatDateOnly, formatTimeOnly, localTimeToIso } from "../lib/format";
import {
  cancelLocalReminders,
  countLocalReminders,
  getReminderPermission,
  requestReminderPermission,
  scheduleLocalReminders,
  type ReminderPermission,
} from "../lib/reminders";
import { enabledReminderTimes } from "../lib/schedule";
import { isValidTimeOfDay, listToText, parseList } from "../lib/validation";
import { AppText, Badge, Banner, Button, Card, Divider, Row, Screen, Stack, TextField } from "../ui/components";
import { EmptyState, ErrorState, LoadingState, PermissionDenied } from "../ui/states";
import { colors, space } from "../ui/theme";

export function MedicationScreen() {
  const res = useResource((signal) => medicationApi.list(signal));
  const [updated, setUpdated] = useState<Record<string, MedicationSchedule>>({});

  const schedules = (res.data?.items ?? []).map((s) => updated[s.id] ?? s);

  if (res.loading) return <Screen><LoadingState label="Loading your medicine schedule…" /></Screen>;
  if (res.error && !res.data) return <Screen><ErrorState error={res.error} onRetry={res.reload} /></Screen>;

  return (
    <Screen refreshing={res.refreshing} onRefresh={() => { setUpdated({}); res.refresh(); }}>
      <Stack>
        <Banner tone="info" title="You record your own doses" icon="info">
          "Taken" and "Skipped" are self-reported. HealthHub does not check them and does not give medical advice.
        </Banner>
        <LocalReminders schedules={schedules} />
        {schedules.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No medicine schedules yet"
            body="Open a prescription, review its medicines, and add a complete, reviewed medicine to your schedule."
          />
        ) : (
          schedules.map((s) => <ScheduleCard key={s.id} schedule={s} onUpdated={(n) => setUpdated((u) => ({ ...u, [n.id]: n }))} />)
        )}
      </Stack>
    </Screen>
  );
}

function ScheduleCard({ schedule, onUpdated }: { schedule: MedicationSchedule; onUpdated: (s: MedicationSchedule) => void }) {
  const [reported, setReported] = useState<Record<string, DoseStatus>>({});
  const [busyTime, setBusyTime] = useState<string | null>(null);
  const [doseError, setDoseError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [timesText, setTimesText] = useState(listToText(schedule.reminderTimes));
  const [enabled, setEnabled] = useState(schedule.remindersEnabled);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const badTimes = parseList(timesText).filter((t) => !isValidTimeOfDay(t));
  const timesError = badTimes.length ? `Use 24-hour HH:mm, for example 08:00. Not valid: ${badTimes.join(", ")}` : null;

  async function report(time: string, status: DoseStatus) {
    const scheduledFor = localTimeToIso(time);
    if (!scheduledFor) return;
    setBusyTime(`${time}:${status}`);
    setDoseError(null);
    try {
      const event = await medicationApi.reportDose(schedule.id, { scheduledFor, status });
      setReported((r) => ({ ...r, [time]: event?.status ?? status })); // only after the server accepted it
    } catch (error) {
      const info = describeError(error);
      setDoseError(`${info.title}. ${info.detail}`);
    } finally {
      setBusyTime(null);
    }
  }

  async function save() {
    if (timesError) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await medicationApi.update(schedule.id, { remindersEnabled: enabled, reminderTimes: parseList(timesText).sort() });
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
      <AppText variant="heading" accessibilityRole="header">{schedule.medicationName}</AppText>
      <AppText>{schedule.dose} · {schedule.frequency}</AppText>
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
          {saveError ? <Banner tone="danger" title={saveError} icon="alert-circle" /> : null}
          <Button label="Save reminder settings" onPress={() => void save()} loading={saving} disabled={Boolean(timesError)} />
          <Button label="Cancel" variant="ghost" onPress={() => setEditing(false)} disabled={saving} />
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
              <AppText variant="label">Today's doses (self-report)</AppText>
              {schedule.reminderTimes.map((time) => {
                const done = reported[time];
                const label = formatTimeOnly(localTimeToIso(time));
                return (
                  <Row key={time} style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                    <AppText>{label || time}</AppText>
                    {done ? (
                      <Badge label={`You marked ${done}`} tone={done === "taken" ? "success" : "neutral"} icon={done === "taken" ? "check" : "skip-forward"} />
                    ) : (
                      <Row>
                        <Button label="Taken" variant="secondary" onPress={() => void report(time, "taken")} loading={busyTime === `${time}:taken`} disabled={busyTime !== null} accessibilityHint={`Record that you took the ${label} dose`} />
                        <Button label="Skipped" variant="ghost" onPress={() => void report(time, "skipped")} loading={busyTime === `${time}:skipped`} disabled={busyTime !== null} accessibilityHint={`Record that you skipped the ${label} dose`} />
                      </Row>
                    )}
                  </Row>
                );
              })}
            </Stack>
          )}
          {doseError ? <Banner tone="danger" title={doseError} icon="alert-circle" /> : null}
          <Button label="Edit reminders" variant="secondary" icon="edit-2" onPress={() => { setTimesText(listToText(schedule.reminderTimes)); setEnabled(schedule.remindersEnabled); setEditing(true); }} />
        </>
      )}
    </Card>
  );
}

/** Prototype: local on-device reminders. Clearly separate from server-delivered push (not built). */
function LocalReminders({ schedules }: { schedules: MedicationSchedule[] }) {
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const times = enabledReminderTimes(schedules);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [perm, scheduled] = [await getReminderPermission(), await countLocalReminders()];
        if (!cancelled) {
          setPermission(perm);
          setCount(scheduled);
        }
      } catch {
        if (!cancelled) setPermission(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      let perm = await getReminderPermission();
      if (perm !== "granted") perm = await requestReminderPermission();
      setPermission(perm);
      if (perm !== "granted") return;
      const n = await scheduleLocalReminders(times);
      setCount(n);
      setMessage(n === 0 ? "No reminder times to schedule." : `Scheduled ${n} daily reminder${n > 1 ? "s" : ""} on this phone.`);
    } catch {
      setMessage("Couldn't set local reminders on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    await cancelLocalReminders();
    setCount(0);
    setMessage("Local reminders turned off.");
    setBusy(false);
  }

  return (
    <Card>
      <Row>
        <AppText variant="heading" accessibilityRole="header">Local reminders</AppText>
        <Badge label="Prototype" tone="demo" icon="info" />
      </Row>
      <AppText variant="small" muted>
        These reminders are set on this phone only. They are not sent by HealthHub's server, so they may not arrive if notifications are off, the app is reinstalled, or your phone limits background activity. Don't rely on them for essential doses. They never show medicine names.
      </AppText>
      {permission === "denied" ? (
        <PermissionDenied what="Notification" why="Turn notifications on in Settings to use local reminders." />
      ) : null}
      {times.length === 0 ? (
        <AppText variant="small" color={colors.textMuted}>Turn on reminders and add times to a schedule first.</AppText>
      ) : count > 0 ? (
        <Button label="Turn off local reminders" variant="secondary" icon="bell-off" onPress={() => void turnOff()} loading={busy} />
      ) : (
        <Button label="Turn on local reminders" variant="secondary" icon="bell" onPress={() => void turnOn()} loading={busy} />
      )}
      {message ? <AppText variant="small" accessibilityLiveRegion="polite">{message}</AppText> : null}
    </Card>
  );
}
