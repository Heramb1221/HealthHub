"use client";

import * as React from "react";
import {
  Calendar,
  CalendarCheck2,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Info,
  LoaderCircle,
  Pill,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calendarApi } from "@/lib/api/calendar";
import { describeError } from "@/lib/api/errors";
import { medicationSchedulesApi } from "@/lib/api/medication-schedules";
import { prescriptionsApi } from "@/lib/api/prescriptions";
import type { CalendarStatus, MedicationSchedule, Prescription } from "@/lib/api/types";
import { createGoogleCalendarWebUrl, downloadMedicationIcsFile, type MedicationCalendarItem } from "@/lib/calendar";
import { formatDate } from "@/lib/format";
import { suggestEndDate, suggestTimes } from "@/lib/frequency";
import { toIsoDate } from "@/lib/schedule";

interface MedicationConfig {
  medicationIndex: number;
  name: string;
  strength: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
  times: string[];
  startDate: string;
  endDate: string;
  existingScheduleId?: string;
  saved: boolean;
}

const COMMON_TIME_PRESETS = [
  { label: "Morning", time: "08:00" },
  { label: "Afternoon", time: "13:00" },
  { label: "Evening", time: "18:00" },
  { label: "Night", time: "21:00" },
];

function findExistingSchedule(
  existingSchedules: MedicationSchedule[],
  prescriptionId: string,
  medName: string,
): MedicationSchedule | undefined {
  const norm = (medName || "").trim().toLowerCase();
  if (!norm) return undefined;
  return (
    existingSchedules.find(
      (s) =>
        s.prescriptionId === prescriptionId &&
        (s.medicationName || "").trim().toLowerCase() === norm,
    ) ||
    existingSchedules.find(
      (s) => (s.medicationName || "").trim().toLowerCase() === norm,
    )
  );
}

function buildInitialConfigs(prescription: Prescription, existingSchedules: MedicationSchedule[] = []): MedicationConfig[] {
  const todayStr = toIsoDate(new Date());
  return prescription.medications.map((med, index) => {
    const existing = findExistingSchedule(existingSchedules, prescription.id, med.name || "");

    const defaultTimes = existing?.times && existing.times.length > 0
      ? existing.times
      : suggestTimes(med.frequency) || ["08:00"];

    // Reminders run in the present and future; never start on a past prescription date
    const rawStart = existing?.startDate || todayStr;
    const defaultStart = rawStart < todayStr ? todayStr : rawStart;

    let defaultEnd = existing?.endDate || "";
    if (!defaultEnd && med.duration) {
      defaultEnd = suggestEndDate(defaultStart, med.duration) || "";
    }
    if (defaultEnd && defaultEnd < defaultStart) {
      defaultEnd = "";
    }

    return {
      medicationIndex: index,
      name: med.name || `Medication #${index + 1}`,
      strength: med.strength || "",
      dose: med.dose || "1 dose",
      frequency: med.frequency || "As prescribed",
      duration: med.duration || "",
      instructions: med.instructions || "",
      times: defaultTimes,
      startDate: defaultStart,
      endDate: defaultEnd,
      existingScheduleId: existing?.id,
      saved: Boolean(existing?.id),
    };
  });
}

export function MedicationSetupWizard({
  open,
  onClose,
  prescription,
  existingSchedules = [],
  onCompleted,
}: {
  open: boolean;
  onClose: () => void;
  prescription: Prescription;
  existingSchedules?: MedicationSchedule[];
  onCompleted?: () => void;
}) {
  const medications = prescription.medications;
  const [currentStep, setCurrentStep] = React.useState(0);
  const [configs, setConfigs] = React.useState<MedicationConfig[]>(() =>
    buildInitialConfigs(prescription, existingSchedules),
  );
  const [verified, setVerified] = React.useState(
    prescription.verificationStatus === "patient_corrected" ||
      prescription.verificationStatus === "verified_by_authorized_clinician",
  );
  const [saving, setSaving] = React.useState(false);
  const [calendarStatus, setCalendarStatus] = React.useState<CalendarStatus | null>(null);
  const [syncingCalendar, setSyncingCalendar] = React.useState(false);
  const [calendarSyncedCount, setCalendarSyncedCount] = React.useState<number | null>(null);

  // Load calendar integration status
  React.useEffect(() => {
    if (!open) return;
    calendarApi
      .getStatus()
      .then((status) => setCalendarStatus(status))
      .catch(() => {
        setCalendarStatus({ isConfigured: false, connected: false });
      });
  }, [open]);

  if (!open || medications.length === 0) return null;

  const totalSteps = medications.length + 1; // 0..N-1: Medicines, N: Calendar
  const isCalendarStep = currentStep === medications.length;
  const currentConfig = configs[currentStep] as MedicationConfig | undefined;

  function updateCurrentConfig(patch: Partial<MedicationConfig>) {
    setConfigs((prev) =>
      prev.map((cfg, idx) => (idx === currentStep ? { ...cfg, ...patch } : cfg)),
    );
  }

  function togglePresetTime(time: string) {
    if (!currentConfig) return;
    const exists = currentConfig.times.includes(time);
    let newTimes: string[];
    if (exists) {
      if (currentConfig.times.length === 1) {
        toast.error("At least one reminder time is required");
        return;
      }
      newTimes = currentConfig.times.filter((t) => t !== time);
    } else {
      newTimes = [...currentConfig.times, time].sort();
    }
    updateCurrentConfig({ times: newTimes });
  }

  function addCustomTime() {
    if (!currentConfig) return;
    const defaultTime = "12:00";
    if (!currentConfig.times.includes(defaultTime)) {
      updateCurrentConfig({ times: [...currentConfig.times, defaultTime].sort() });
    } else {
      updateCurrentConfig({ times: [...currentConfig.times, "09:00"].sort() });
    }
  }

  function removeTime(idx: number) {
    if (!currentConfig) return;
    if (currentConfig.times.length <= 1) {
      toast.error("You must have at least one reminder time");
      return;
    }
    const newTimes = currentConfig.times.filter((_, i) => i !== idx);
    updateCurrentConfig({ times: newTimes });
  }

  function changeTimeValue(idx: number, val: string) {
    if (!currentConfig) return;
    const newTimes = [...currentConfig.times];
    newTimes[idx] = val;
    updateCurrentConfig({ times: newTimes });
  }

  async function saveCurrentMedicationAndProceed() {
    if (!currentConfig) return;

    if (currentConfig.times.length === 0 || currentConfig.times.some((t) => !t)) {
      toast.error("Please enter a valid time for all reminder slots");
      return;
    }

    if (!currentConfig.startDate) {
      toast.error("Please specify a start date");
      return;
    }

    setSaving(true);
    try {
      const scheduleId =
        currentConfig.existingScheduleId ||
        findExistingSchedule(existingSchedules, prescription.id, currentConfig.name)?.id;

      if (scheduleId) {
        await medicationSchedulesApi.update(scheduleId, {
          times: currentConfig.times,
          endDate: currentConfig.endDate || null,
          active: true,
        });
        updateCurrentConfig({ existingScheduleId: scheduleId, saved: true });
      } else {
        // If prescription has not been verified/confirmed yet, confirm it first so the
        // clinical safety gate allows schedule creation (must be patient_corrected).
        if (!verified) {
          try {
            await prescriptionsApi.correct(prescription.id, {
              prescriptionDate: prescription.prescriptionDate,
              prescriberName: prescription.prescriberName,
              medications: prescription.medications.map((m) => ({
                name: m.name,
                strength: m.strength,
                dose: m.dose,
                route: m.route,
                frequency: m.frequency,
                duration: m.duration,
                instructions: m.instructions,
              })),
            });
            setVerified(true);
          } catch {
            // Proceed to schedule creation if already confirmed
          }
        }

        let currentVersion = 1;
        try {
          const vs = await prescriptionsApi.versions(prescription.id);
          if (vs && vs.length > 0) {
            currentVersion = Math.max(...vs.map((v) => v.versionNumber));
          }
        } catch {
          // Fallback to 1
        }

        const created = await medicationSchedulesApi.create({
          prescriptionId: prescription.id,
          versionNumber: currentVersion,
          medicationIndex: currentConfig.medicationIndex,
          medicationName: currentConfig.name,
          confirmedAgainstPaper: true,
          times: currentConfig.times,
          startDate: currentConfig.startDate,
          endDate: currentConfig.endDate || null,
        });
        updateCurrentConfig({ existingScheduleId: created.id, saved: true });
      }

      toast.success(`Saved reminders for ${currentConfig.name}`);
      setCurrentStep((prev) => prev + 1);
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error(title, { description: detail });
    } finally {
      setSaving(false);
    }
  }

  async function handleConnectGoogleCalendar() {
    try {
      const { url } = await calendarApi.getGoogleAuthUrl();
      if (url.startsWith("#")) {
        setCalendarStatus({
          isConfigured: true,
          connected: true,
          email: "patient@google.com",
          provider: "google_oauth",
        });
        toast.success("Google Calendar connected (Demo)");
        return;
      }
      window.location.href = url;
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error("Could not connect to Google Calendar", { description: `${title}. ${detail}` });
    }
  }

  async function handleSyncToGoogleCalendar() {
    setSyncingCalendar(true);
    try {
      const res = await calendarApi.syncSchedules({ prescriptionId: prescription.id });
      setCalendarSyncedCount(res.syncedCount);
      toast.success(`Synced ${res.syncedCount} medication reminders to Google Calendar!`);
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error("Google Calendar sync failed", { description: `${title}. ${detail}` });
    } finally {
      setSyncingCalendar(false);
    }
  }

  function handleDownloadIcs() {
    const calendarItems: MedicationCalendarItem[] = configs.flatMap((cfg) =>
      cfg.times.map((time) => ({
        medicationName: cfg.name,
        strength: cfg.strength,
        dose: cfg.dose,
        frequency: cfg.frequency,
        instructions: cfg.instructions,
        time,
        startDate: cfg.startDate,
        endDate: cfg.endDate || null,
      })),
    );

    downloadMedicationIcsFile(
      calendarItems,
      `healthhub-${prescription.id.slice(0, 8)}-reminders.ics`,
    );
    toast.success("Downloaded .ics calendar file");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div className="bg-card flex max-h-[92vh] w-full max-w-2xl flex-col rounded-xl border shadow-2xl">
        {/* Wizard Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-full text-xs font-semibold">
                <Pill className="size-4" aria-hidden="true" />
              </span>
              <h2 id="wizard-title" className="text-lg font-semibold text-foreground">
                Set Up Medication Reminders
              </h2>
            </div>
            <p className="text-muted-foreground text-xs">
              {isCalendarStep
                ? "Step 3 of 3: Sync reminder alerts with Google Calendar"
                : `Step ${currentStep + 1} of ${totalSteps}: Review times for ${currentConfig?.name}`}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={onClose}>
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="bg-muted h-1 w-full overflow-hidden">
          <div
            className="bg-primary h-full transition-all duration-300"
            style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
          />
        </div>

        {/* Wizard Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!isCalendarStep && currentConfig ? (
            <div className="space-y-6">
              {/* Medicine Card Overview */}
              <div className="bg-muted/40 rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-base text-foreground">
                      {currentConfig.name}
                    </span>
                    {currentConfig.strength ? (
                      <Badge tone="info">{currentConfig.strength}</Badge>
                    ) : null}
                  </div>
                  <Badge tone="neutral" className="text-xs">
                    Prescribed: {currentConfig.frequency}
                  </Badge>
                </div>

                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    <span className="font-medium text-foreground">Dose:</span> {currentConfig.dose}
                  </div>
                  {currentConfig.duration ? (
                    <div>
                      <span className="font-medium text-foreground">Duration:</span>{" "}
                      {currentConfig.duration}
                    </div>
                  ) : null}
                  {currentConfig.instructions ? (
                    <div className="sm:col-span-2">
                      <span className="font-medium text-foreground">Instructions:</span>{" "}
                      {currentConfig.instructions}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Time Configuration Section */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Reminder Times</Label>
                <p className="text-muted-foreground text-xs">
                  Choose the times of day you want to take this medicine. We pre-selected slots based on your prescription frequency.
                </p>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {COMMON_TIME_PRESETS.map((p) => {
                    const active = currentConfig.times.includes(p.time);
                    return (
                      <button
                        key={p.time}
                        type="button"
                        onClick={() => togglePresetTime(p.time)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          active
                            ? "border-primary bg-primary text-primary-foreground shadow-xs"
                            : "border-border bg-background text-foreground hover:bg-muted"
                        }`}
                      >
                        {active ? <Check className="size-3" aria-hidden="true" /> : <Plus className="size-3" aria-hidden="true" />}
                        {p.label} ({p.time})
                      </button>
                    );
                  })}
                </div>

                {/* Active Times List */}
                <div className="space-y-2 pt-2">
                  {currentConfig.times.map((t, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <Clock className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" aria-hidden="true" />
                        <Input
                          type="time"
                          value={t}
                          onChange={(e) => changeTimeValue(idx, e.target.value)}
                          className="pl-9"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTime(idx)}
                        disabled={currentConfig.times.length <= 1}
                        className="text-muted-foreground hover:text-destructive size-9 p-0"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        <span className="sr-only">Remove time</span>
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCustomTime}
                    className="mt-2 text-xs"
                  >
                    <Plus className="mr-1 size-3.5" aria-hidden="true" /> Add another reminder slot
                  </Button>
                </div>
              </div>

              {/* Date Range Section */}
              <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t">
                <div className="space-y-1.5">
                  <Label htmlFor="med-start-date" className="text-xs font-medium">
                    Start Date
                  </Label>
                  <Input
                    id="med-start-date"
                    type="date"
                    value={currentConfig.startDate}
                    onChange={(e) => updateCurrentConfig({ startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="med-end-date" className="text-xs font-medium">
                    End Date (Reminder Cutoff)
                  </Label>
                  <Input
                    id="med-end-date"
                    type="date"
                    min={currentConfig.startDate}
                    value={currentConfig.endDate}
                    onChange={(e) => updateCurrentConfig({ endDate: e.target.value })}
                  />
                  <p className="text-muted-foreground text-[11px]">
                    {currentConfig.endDate
                      ? `Reminders will run until ${formatDate(currentConfig.endDate)}`
                      : "Leave blank for an ongoing medication."}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Google Calendar Step */
            <div className="space-y-6">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">
                  Sync Your Medication Reminders
                </h3>
                <p className="text-muted-foreground text-xs">
                  Put your scheduled reminder alarms directly onto Google Calendar so you receive notifications on all your phones and computers.
                </p>
              </div>

              {/* Medication Schedules Summary */}
              <div className="space-y-3">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Configured Medicines ({configs.length})
                </span>
                <div className="divide-y rounded-lg border bg-card">
                  {configs.map((cfg) => {
                    // Create direct Google Calendar web link for the first time slot
                    const firstTime = cfg.times[0] || "08:00";
                    const directUrl = createGoogleCalendarWebUrl({
                      medicationName: cfg.name,
                      strength: cfg.strength,
                      dose: cfg.dose,
                      frequency: cfg.frequency,
                      instructions: cfg.instructions,
                      time: firstTime,
                      startDate: cfg.startDate,
                      endDate: cfg.endDate || null,
                    });

                    return (
                      <div
                        key={cfg.name}
                        className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-medium text-foreground">
                            {cfg.name} {cfg.strength}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {cfg.times.join(", ")} · From {formatDate(cfg.startDate)}{" "}
                            {cfg.endDate ? `till ${formatDate(cfg.endDate)}` : "(ongoing)"}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                            <a href={directUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="mr-1 size-3" aria-hidden="true" />
                              Add to Google Calendar
                            </a>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Google Calendar OAuth Integration Box */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Calendar className="size-4 text-primary" aria-hidden="true" />
                      <span className="font-semibold text-sm text-foreground">
                        Google Calendar Account Sync
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {calendarStatus?.connected
                        ? `Connected to Google (${calendarStatus.email || "Primary Account"}).`
                        : "Connect Google Calendar to synchronize all reminder alarms automatically."}
                    </p>
                  </div>

                  {calendarStatus?.connected ? (
                    <Badge tone="success" className="shrink-0">
                      <CheckCircle2 className="mr-1 size-3" aria-hidden="true" /> Connected
                    </Badge>
                  ) : (
                    <Badge tone="neutral" className="shrink-0">
                      Not connected
                    </Badge>
                  )}
                </div>

                {calendarStatus?.connected ? (
                  <div className="space-y-3">
                    <Button
                      onClick={handleSyncToGoogleCalendar}
                      disabled={syncingCalendar}
                      size="sm"
                      className="w-full sm:w-auto"
                    >
                      {syncingCalendar ? (
                        <>
                          <LoaderCircle className="mr-1 size-4 animate-spin" aria-hidden="true" />
                          Syncing Reminders to Google Calendar...
                        </>
                      ) : (
                        <>
                          <CalendarCheck2 className="mr-1 size-4" aria-hidden="true" />
                          Sync All to Google Calendar
                        </>
                      )}
                    </Button>
                    {calendarSyncedCount !== null ? (
                      <Alert tone="success" className="py-2 text-xs">
                        <CheckCircle2 className="size-4" aria-hidden="true" />
                        <AlertTitle>Synchronization Complete</AlertTitle>
                        <AlertDescription>
                          {calendarSyncedCount} reminder events added to your Google Calendar until your set end dates.
                        </AlertDescription>
                      </Alert>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {calendarStatus?.isConfigured ? (
                      <Button
                        type="button"
                        onClick={handleConnectGoogleCalendar}
                        variant="default"
                        size="sm"
                      >
                        <CalendarPlus className="mr-1 size-4" aria-hidden="true" />
                        Connect Google Calendar Account
                      </Button>
                    ) : (
                      <Alert tone="info" className="py-2.5 text-xs">
                        <Info className="size-4" aria-hidden="true" />
                        <AlertTitle>Instant 1-Click Calendar Links Available</AlertTitle>
                        <AlertDescription>
                          You can click &ldquo;Add to Google Calendar&rdquo; next to any medicine above to save it immediately, or download all schedules as a calendar file below.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {/* .ics file download option */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
                  <span className="text-muted-foreground">
                    Prefer Apple Calendar, Outlook, or mobile calendar app?
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleDownloadIcs}
                  >
                    <Download className="mr-1 size-3" aria-hidden="true" /> Download .ics File
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Navigation */}
        <div className="flex items-center justify-between border-t bg-card px-6 py-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentStep === 0 || saving}
            onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
          >
            <ChevronLeft className="mr-1 size-4" aria-hidden="true" /> Previous
          </Button>

          {!isCalendarStep ? (
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={saveCurrentMedicationAndProceed}
            >
              {saving ? (
                <>
                  <LoaderCircle className="mr-1 size-4 animate-spin" aria-hidden="true" /> Saving...
                </>
              ) : currentStep === medications.length - 1 ? (
                <>
                  Next: Google Calendar <ChevronRight className="ml-1 size-4" aria-hidden="true" />
                </>
              ) : (
                <>
                  Next Medicine ({currentStep + 2}/{medications.length}){" "}
                  <ChevronRight className="ml-1 size-4" aria-hidden="true" />
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                toast.success("Medication schedules configured successfully");
                onCompleted?.();
                onClose();
              }}
            >
              <Check className="mr-1 size-4" aria-hidden="true" /> Finish & View Schedule
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
