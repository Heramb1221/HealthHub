"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { TextField } from "@/components/forms/text-field";
import { PageHeader } from "@/components/layout/page-header";
import { TimesEditor } from "@/components/medications/times-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeError, isApiError } from "@/lib/api/errors";
import { medicationSchedulesApi } from "@/lib/api/medication-schedules";
import { prescriptionsApi } from "@/lib/api/prescriptions";
import type { MedicationSchedule } from "@/lib/api/types";
import { createGoogleCalendarWebUrl } from "@/lib/calendar";
import { formatDate } from "@/lib/format";
import { errorFor, focusFirstInvalid, validateByPath, type FieldErrors } from "@/lib/forms";
import { CONCERN_TEXT, scheduleConcern } from "@/lib/schedule";
import { useResource } from "@/lib/use-resource";
import { reminderSchema } from "@/lib/validation/schedule";

function EditForm({ schedule, concern }: { schedule: MedicationSchedule; concern: string | null }) {
  const router = useRouter();
  const [times, setTimes] = React.useState(schedule.times);
  const [endDate, setEndDate] = React.useState(schedule.endDate ?? "");
  const [active, setActive] = React.useState(schedule.active);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);
    const result = validateByPath(reminderSchema, { times, startDate: schedule.startDate, endDate });
    if (!result.ok) {
      setErrors(result.errors);
      focusFirstInvalid(form);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await medicationSchedulesApi.update(schedule.id, { times: result.data.times, endDate: result.data.endDate, active });
      toast.success("Reminders saved");
      router.push("/medications");
    } catch (error) {
      const { title, detail } = describeError(error);
      setFormError(`${title}. ${detail}`);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-8">
      {formError ? (
        <Alert tone="danger">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Your changes weren’t saved</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      {concern ? (
        <Alert tone="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Check this reminder against your prescription</AlertTitle>
          <AlertDescription>
            <p>{concern}</p>
            {schedule.prescriptionId ? (
              <p className="mt-2">
                <Link href={`/prescriptions/${schedule.prescriptionId}`} className="text-info font-medium underline underline-offset-4">
                  Open the prescription
                </Link>
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <dl className="bg-card divide-y rounded-md border px-4 text-sm">
        <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Medicine</dt>
          <dd className="font-medium">
            {schedule.medicationName} {schedule.strength ?? ""}
          </dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Dose</dt>
          <dd>{schedule.dose}</dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Prescription says</dt>
          <dd>{schedule.frequency ?? "Not found"}</dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Started</dt>
          <dd>{formatDate(schedule.startDate)}</dd>
        </div>
      </dl>
      <p className="text-muted-foreground -mt-4 text-sm">The medicine and dose come from your prescription and can’t be changed here. To change them, correct the prescription.</p>

      <TimesEditor times={times} onChange={setTimes} error={errorFor(errors, "times")} />
      <TextField name="endDate" label="End date (optional)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} hint="Leave empty if there’s no end date." error={errors.endDate} />

      <label className="flex max-w-prose items-start gap-3 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary mt-0.5 size-5 shrink-0" />
        <span>
          <span className="block font-medium">Reminders on</span>
          <span className="text-muted-foreground block">Turn off to pause reminders. Your recorded doses are kept.</span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Saving
            </>
          ) : (
            "Save reminders"
          )}
        </Button>
        <Button asChild variant="outline">
          <a
            href={createGoogleCalendarWebUrl({
              medicationName: schedule.medicationName,
              strength: schedule.strength,
              dose: schedule.dose,
              frequency: schedule.frequency,
              time: times[0] || "08:00",
              startDate: schedule.startDate,
              endDate: endDate || null,
            })}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="mr-1 size-3.5" aria-hidden="true" /> Add to Google Calendar
          </a>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/medications">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

export function EditScheduleView({ id }: { id: string }) {
  const schedule = useResource(() => medicationSchedulesApi.get(id), id);
  const prescriptions = useResource(() => prescriptionsApi.list(), "prescriptions");

  const back = (
    <Link href="/medications" className="text-info inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" /> Medication schedule
    </Link>
  );

  let body: React.ReactNode;
  if (schedule.status === "loading" || prescriptions.status === "loading") {
    body = <LoadingState label="Loading reminder" rows={3} />;
  } else if (schedule.status === "error") {
    body =
      isApiError(schedule.error) && schedule.error.isNotFound ? (
        <EmptyState title="Reminder not found" description="It may have been removed, or it isn’t available to your account." />
      ) : (
        <ErrorState error={schedule.error} onRetry={schedule.reload} />
      );
  } else if (prescriptions.status === "error") {
    body = <ErrorState error={prescriptions.error} onRetry={prescriptions.reload} />;
  } else {
    const c = scheduleConcern(schedule.data, prescriptions.data);
    body = <EditForm schedule={schedule.data} concern={c ? CONCERN_TEXT[c] : null} />;
  }

  return (
    <div className="space-y-6">
      {back}
      <PageHeader title="Edit reminders" />
      {body}
    </div>
  );
}
