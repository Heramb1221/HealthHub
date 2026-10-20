"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, BellOff, Calendar, CalendarClock, Check, CircleSlash, Download, LoaderCircle, MessageCircle, Pencil, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { isNoPatientError, NoPatientProfile } from "@/components/feedback/no-patient";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { DemoTag } from "@/components/status/demo-tag";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calendarApi } from "@/lib/api/calendar";
import { describeError } from "@/lib/api/errors";
import { medicationSchedulesApi } from "@/lib/api/medication-schedules";
import { prescriptionsApi } from "@/lib/api/prescriptions";
import type { MedicationSchedule } from "@/lib/api/types";
import { downloadMedicationIcsFile, type MedicationCalendarItem } from "@/lib/calendar";
import { formatClock, formatDate, formatDayLong, formatTime } from "@/lib/format";
import { CONCERN_TEXT, scheduleConcern, slotsForDay, type DoseSlot } from "@/lib/schedule";
import { useResource } from "@/lib/use-resource";
import { buildWhatsAppReminderUrl } from "@/lib/whatsapp";
import { isBrowserNotificationGranted, requestBrowserNotificationPermission, triggerBrowserMedicationAlarm } from "@/lib/browser-notifications";
import { useLanguage } from "@/lib/i18n/language-context";

function AddButton() {
  return (
    <Button asChild>
      <Link href="/medications/new">
        <Plus aria-hidden="true" /> Add a medicine
      </Link>
    </Button>
  );
}

function datesText(s: MedicationSchedule) {
  return s.endDate ? `${formatDate(s.startDate)} to ${formatDate(s.endDate)}` : `From ${formatDate(s.startDate)}, no end date`;
}

const HOUR = 3_600_000;

function DoseRow({
  slot,
  now,
  concern,
  onRecord,
}: {
  slot: DoseSlot;
  now: Date;
  concern: string | null;

  onRecord: (slot: DoseSlot, status: "taken" | "skipped") => Promise<boolean>;
}) {
  const [changing, setChanging] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");
  const changeRef = React.useRef<HTMLButtonElement>(null);
  const justRecorded = React.useRef(false);
  const { schedule, at, event } = slot;
  const label = `${schedule.medicationName} at ${formatTime(at)}`;

  const canRecord = at.getTime() <= now.getTime() + HOUR;
  const showButtons = canRecord && (!event || changing);

  React.useEffect(() => {
    if (justRecorded.current && event && !changing) {
      changeRef.current?.focus();
      justRecorded.current = false;
    }
  }, [event, changing]);

  async function record(status: "taken" | "skipped") {
    setPending(true);

    justRecorded.current = true;
    const saved = await onRecord(slot, status);
    setPending(false);
    if (saved) {
      setChanging(false);
      setAnnounce(`${label} marked as ${status}.`);
    } else {
      justRecorded.current = false;
    }
  }

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-4">
        <p className="w-20 shrink-0 font-semibold tabular-nums">{formatTime(at)}</p>
        <div className="min-w-0">
          <p className="font-medium">
            {schedule.medicationName}
            {schedule.strength ? ` ${schedule.strength}` : ""}
            <span className="text-muted-foreground font-normal"> · {schedule.dose}</span>
          </p>
          {concern ? (
            <p className="pt-0.5">
              <Badge tone="warning">
                <TriangleAlert aria-hidden="true" /> Check this reminder
              </Badge>
            </p>
          ) : null}
          {event && !changing ? (
            <p className="text-muted-foreground text-sm">Recorded at {formatTime(new Date(event.recordedAt))} · self-reported</p>
          ) : (
            <p className="text-muted-foreground text-sm">{at > now ? "Upcoming" : "Not recorded yet"}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-24 sm:pl-0">
        {event && !changing ? (
          <>
            {event.status === "taken" ? (
              <Badge tone="success">
                <Check aria-hidden="true" /> Taken
              </Badge>
            ) : (
              <Badge tone="neutral">
                <CircleSlash aria-hidden="true" /> Skipped
              </Badge>
            )}
            <Button ref={changeRef} variant="ghost" size="sm" onClick={() => setChanging(true)} aria-label={`Change record for ${label}`}>
              Change
            </Button>
          </>
        ) : null}
        {showButtons ? (
          <>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => record("taken")} aria-label={`Mark ${label} as taken`}>
              <Check aria-hidden="true" /> Taken
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => record("skipped")} aria-label={`Mark ${label} as skipped`}>
              <CircleSlash aria-hidden="true" /> Skipped
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50">
              <a
                href={buildWhatsAppReminderUrl({
                  medicationName: schedule.medicationName,
                  dosage: schedule.dose,
                  timeStr: formatTime(at),
                })}
                target="_blank"
                rel="noopener noreferrer"
                title="Send WhatsApp reminder"
                aria-label={`Send WhatsApp reminder for ${label}`}
              >
                <MessageCircle className="size-3.5 text-emerald-600" aria-hidden="true" />
                <span className="hidden sm:inline">WhatsApp</span>
              </a>
            </Button>
            {changing ? (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setChanging(false)}>
                Cancel
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
      <span role="status" className="sr-only">
        {announce}
      </span>
    </li>
  );
}

export function MedicationsView() {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const schedules = useResource(() => medicationSchedulesApi.list(), "schedules");
  const prescriptions = useResource(() => prescriptionsApi.list(), "prescriptions");

  async function record(slot: DoseSlot, status: "taken" | "skipped"): Promise<boolean> {
    try {
      const event = await medicationSchedulesApi.recordDose(slot.schedule.id, { scheduledFor: slot.at.toISOString(), status });

      if (schedules.status === "ready") {
        schedules.setData(schedules.data.map((s) => (s.id === slot.schedule.id ? { ...s, doseEvents: [...(s.doseEvents ?? []), event] } : s)));
      }
      return true;
    } catch (error) {
      const { title, detail } = describeError(error);
      const msg = detail && detail !== title ? detail : title;
      toast.error("That wasn’t recorded", { description: msg });
      return false;
    }
  }

  const concerns = new Map<string, string>();
  if (schedules.status === "ready" && prescriptions.status === "ready") {
    for (const s of schedules.data) {
      const c = scheduleConcern(s, prescriptions.data);
      if (c) concerns.set(s.id, CONCERN_TEXT[c]);
    }
  }

  const [syncingCalendar, setSyncingCalendar] = React.useState(false);

  async function handleSyncCalendar() {
    setSyncingCalendar(true);
    try {
      const status = await calendarApi.getStatus();
      if (!status.connected) {
        if (!status.isConfigured) {
          toast.info("Google Calendar API is not configured on the server. You can export using the .ics file button.");
          return;
        }
        const { url } = await calendarApi.getGoogleAuthUrl();
        if (url.startsWith("#")) {
          toast.success("Google Calendar connected (Demo)");
        } else {
          window.location.href = url;
          return;
        }
      }

      const res = await calendarApi.syncSchedules({});
      toast.success(`Synced ${res.syncedCount} medication reminders to Google Calendar!`);
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error("Could not sync with Google Calendar", { description: `${title}. ${detail}` });
    } finally {
      setSyncingCalendar(false);
    }
  }

  function handleExportIcs() {
    if (schedules.status !== "ready" || schedules.data.length === 0) return;
    const items: MedicationCalendarItem[] = schedules.data.flatMap((s) =>
      s.times.map((time) => ({
        medicationName: s.medicationName,
        strength: s.strength,
        dose: s.dose,
        frequency: s.frequency,
        time,
        startDate: s.startDate,
        endDate: s.endDate,
      })),
    );
    downloadMedicationIcsFile(items, "healthhub-all-medications.ics");
    toast.success("Exported schedules to .ics calendar file");
  }

  const { t } = useLanguage();
  const [deviceAlarmsActive, setDeviceAlarmsActive] = React.useState(() => isBrowserNotificationGranted());

  async function handleToggleDeviceAlarms() {
    const granted = await requestBrowserNotificationPermission();
    setDeviceAlarmsActive(granted);
    if (granted) {
      toast.success(t("active_alarms", "Device alarms active for scheduled doses"), {
        description: "Your browser will trigger notification alarms at your scheduled dose times.",
      });
      triggerBrowserMedicationAlarm({
        medicationName: "HealthHub Reminder",
        dose: "Alarm Active",
        instructions: "Scheduled dose alarms will trigger automatically.",
      });
    } else {
      toast.info("Browser notifications unavailable or blocked in settings.");
    }
  }

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {schedules.status === "ready" && schedules.data.length > 0 ? (
        <>
          <Button
            type="button"
            variant={deviceAlarmsActive ? "secondary" : "outline"}
            size="sm"
            onClick={handleToggleDeviceAlarms}
            title="Enable local device alarms and browser notifications"
          >
            <Bell className={`mr-1.5 size-4 ${deviceAlarmsActive ? "text-primary" : ""}`} aria-hidden="true" />
            {deviceAlarmsActive ? t("device_alarms", "Device Alarms: On") : t("enable_notifications", "Enable Alarms")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSyncCalendar}
            disabled={syncingCalendar}
          >
            {syncingCalendar ? (
              <LoaderCircle className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Calendar className="mr-1.5 size-4" aria-hidden="true" />
            )}
            Sync Google Calendar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportIcs}
          >
            <Download className="mr-1.5 size-4" aria-hidden="true" />
            Export .ics
          </Button>
        </>
      ) : null}
      <AddButton />
    </div>
  );

  return (
    <div className="space-y-10">
      <PageHeader
        title="Medication schedule"
        description="Reminders for medicines you’ve checked against your paper prescription. Taken and skipped are recorded by you; HealthHub doesn’t check them."
        actions={actions}
      />

      {schedules.status === "loading" ? (
        <LoadingState label="Loading your schedule" rows={4} />
      ) : schedules.status === "error" ? (
        isNoPatientError(schedules.error) ? <NoPatientProfile /> : <ErrorState error={schedules.error} onRetry={schedules.reload} />
      ) : schedules.data.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No medication reminders yet"
          description="Your active medications and daily reminders are automatically created when you upload a prescription. You can also add custom medicines anytime."
          action={<AddButton />}
        />
      ) : (
        <>
          <section aria-labelledby="today" className="space-y-2">
            <h2 id="today" className="text-lg">
              Today, {formatDayLong(now)}
            </h2>
            {(() => {
              const slots = slotsForDay(schedules.data, now);
              return slots.length === 0 ? (
                <p className="text-muted-foreground text-sm">No reminders today.</p>
              ) : (
                <ul className="divide-y rounded-md border bg-card px-4">
                  {slots.map((slot) => (
                    <DoseRow key={`${slot.schedule.id}-${slot.at.toISOString()}`} slot={slot} now={now} concern={concerns.get(slot.schedule.id) ?? null} onRecord={record} />
                  ))}
                </ul>
              );
            })()}
            <p className="text-muted-foreground text-sm">Reminders appear here and on your dashboard. Push, SMS and email reminders aren’t set up yet.</p>
          </section>

          <section aria-labelledby="all" className="space-y-4">
            <h2 id="all" className="text-lg">
              Your schedule
            </h2>

            {prescriptions.status === "ready"
              ? (() => {
                  const flagged = schedules.data.filter((s) => scheduleConcern(s, prescriptions.data));
                  return flagged.length ? (
                    <Alert tone="warning">
                      <TriangleAlert aria-hidden="true" />
                      <AlertTitle>Check {flagged.length === 1 ? "this reminder" : "these reminders"} against your prescription</AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc pl-4">
                          {flagged.map((s) => (
                            <li key={s.id}>
                              {s.medicationName}: {CONCERN_TEXT[scheduleConcern(s, prescriptions.data)!]}
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  ) : null;
                })()
              : null}

            <div className="hidden md:block">
              <Table>
                <TableCaption className="sr-only">Medicines in your schedule</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Times</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Reminders</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.data.map((s) => (
                    <TableRow key={s.id} className="align-top">
                      <TableCell className="space-y-1">
                        <p className="font-medium">
                          {s.medicationName}
                          {s.strength ? ` ${s.strength}` : ""}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {s.dose}
                          {s.frequency ? ` · prescription says “${s.frequency}”` : ""}
                        </p>
                        {s.prescriptionId ? (
                          <Link href={`/prescriptions/${s.prescriptionId}`} className="text-info text-xs underline underline-offset-4">
                            View prescription
                          </Link>
                        ) : null}
                        {s.isDemo ? <div><DemoTag /></div> : null}
                      </TableCell>
                      <TableCell>{s.times.map(formatClock).join(", ")}</TableCell>
                      <TableCell className="text-sm">{datesText(s)}</TableCell>
                      <TableCell>
                        {s.active ? (
                          <Badge tone="success">On</Badge>
                        ) : (
                          <Badge>
                            <BellOff aria-hidden="true" /> Paused
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/medications/${s.id}`} aria-label={`Edit reminders for ${s.medicationName}`}>
                            <Pencil aria-hidden="true" /> Edit reminders
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y rounded-md border md:hidden">
              {schedules.data.map((s) => (
                <li key={s.id} className="space-y-2 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">
                      {s.medicationName}
                      {s.strength ? ` ${s.strength}` : ""}
                    </p>
                    {s.active ? <Badge tone="success">On</Badge> : <Badge>Paused</Badge>}
                  </div>
                  <p className="text-sm">
                    {s.dose} · {s.times.map(formatClock).join(", ")}
                  </p>
                  <p className="text-muted-foreground text-xs">{datesText(s)}</p>
                  {s.isDemo ? <DemoTag /> : null}
                  <div className="flex flex-wrap gap-3 pt-1">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/medications/${s.id}`} aria-label={`Edit reminders for ${s.medicationName}`}>
                        Edit reminders
                      </Link>
                    </Button>
                    {s.prescriptionId ? (
                      <Link href={`/prescriptions/${s.prescriptionId}`} className="text-info self-center text-sm underline underline-offset-4">
                        View prescription
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
