"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileSearch, LoaderCircle, Pill, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { isNoPatientError, NoPatientProfile } from "@/components/feedback/no-patient";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { TextField } from "@/components/forms/text-field";
import { PageHeader } from "@/components/layout/page-header";
import { TimesEditor } from "@/components/medications/times-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api/errors";
import { medicationSchedulesApi } from "@/lib/api/medication-schedules";
import { prescriptionsApi } from "@/lib/api/prescriptions";
import type { Prescription, PrescriptionMedication } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { errorFor, focusFirstInvalid, validateByPath, type FieldErrors } from "@/lib/forms";
import { suggestEndDate, suggestTimes } from "@/lib/frequency";
import { medicationReviewReasons, REVIEW_REASON_LABEL } from "@/lib/prescription-safety";
import { toIsoDate } from "@/lib/schedule";
import { useResource } from "@/lib/use-resource";
import { reminderSchema } from "@/lib/validation/schedule";

interface Option {
  rx: Prescription;
  index: number;
  med: PrescriptionMedication;
  reasons: string[];
  already: boolean;
}

function options(prescriptions: Prescription[], scheduledKeys: Set<string>): Option[] {
  const out: Option[] = [];
  for (const rx of prescriptions) {
    if (rx.processingStatus !== "completed") continue;
    rx.medications.forEach((med, index) => {
      const reasons = medicationReviewReasons(med).map((r) => REVIEW_REASON_LABEL[r]);
      out.push({ rx, index, med, reasons, already: scheduledKeys.has(`${rx.id}:${(med.name ?? "").toLowerCase()}`) });
    });
  }
  return out;
}

export function AddScheduleView() {
  const router = useRouter();
  const prescriptions = useResource(() => prescriptionsApi.list(), "prescriptions");
  const schedules = useResource(() => medicationSchedulesApi.list(), "schedules");

  const [selected, setSelected] = React.useState<string | null>(null);
  const [times, setTimes] = React.useState<string[]>([""]);
  const [timesTouched, setTimesTouched] = React.useState(false);
  const [startDate, setStartDate] = React.useState(() => toIsoDate(new Date()));
  const [endDate, setEndDate] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const back = (
    <Link href="/medications" className="text-info inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" /> Medication schedule
    </Link>
  );
  const header = <PageHeader title="Add a medicine to your schedule" description="Choose a medicine from your prescriptions, then pick the times you want to be reminded." />;

  if (prescriptions.status === "loading" || schedules.status === "loading") {
    return (
      <div className="space-y-6">
        {back}
        {header}
        <LoadingState label="Loading your prescriptions" rows={3} />
      </div>
    );
  }
  if (prescriptions.status === "error" || schedules.status === "error") {
    const failed = prescriptions.status === "error" ? prescriptions : (schedules as Extract<typeof schedules, { status: "error" }>);
    return (
      <div className="space-y-6">
        {back}
        {header}
        {isNoPatientError(failed.error) ? (
          <NoPatientProfile />
        ) : (
          <ErrorState
            error={failed.error}
            onRetry={() => {
              prescriptions.reload();
              schedules.reload();
            }}
          />
        )}
      </div>
    );
  }

  const scheduledKeys = new Set(schedules.data.map((s) => `${s.prescriptionId}:${s.medicationName.toLowerCase()}`));
  const all = options(prescriptions.data, scheduledKeys);
  const ready = all.filter((o) => o.reasons.length === 0 && !o.already);
  const optionKey = (o: Option) => `${o.rx.id}:${o.index}`;
  const chosen = all.find((o) => optionKey(o) === selected) ?? null;

  const needsConfirmation = !!chosen && chosen.med.source !== "patient_entered" && chosen.rx.verificationStatus !== "verified_by_authorized_clinician";

  function choose(o: Option) {
    setSelected(optionKey(o));
    setConfirmed(false);
    setErrors({});
    if (!timesTouched) setTimes(suggestTimes(o.med.frequency) ?? [""]);
    setEndDate(suggestEndDate(startDate, o.med.duration) ?? "");
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);
    if (!chosen) {
      setErrors({ medicine: "Choose a medicine to schedule." });
      document.getElementById("medicine-group")?.focus();
      return;
    }
    const result = validateByPath(reminderSchema, { times, startDate, endDate });
    if (!result.ok || (needsConfirmation && !confirmed)) {
      setErrors({
        ...(result.ok ? {} : result.errors),
        ...(needsConfirmation && !confirmed ? { confirmed: "Confirm that you checked this medicine against your paper prescription." } : {}),
      });
      focusFirstInvalid(form);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await medicationSchedulesApi.create({
        prescriptionId: chosen.rx.id,
        medicationIndex: chosen.index,
        medicationName: chosen.med.name ?? "",
        confirmedAgainstPaper: confirmed || !needsConfirmation,
        times: result.data.times,
        startDate: result.data.startDate,
        endDate: result.data.endDate,
      });
      toast.success("Added to your schedule");
      router.push("/medications");
    } catch (error) {
      const { title, detail } = describeError(error);
      setFormError(`${title}. ${detail}`);
      setPending(false);
    }
  }

  if (all.length === 0 || ready.length === 0) {
    const blocked = all.filter((o) => o.reasons.length > 0).length;
    return (
      <div className="space-y-6">
        {back}
        {header}
        <EmptyState
          icon={Pill}
          title="No medicines are ready to schedule"
          description={
            all.length === 0
              ? "Upload a prescription and wait for it to be read. Then it can be reviewed and scheduled."
              : blocked > 0
                ? `${blocked} ${blocked === 1 ? "medicine still needs" : "medicines still need"} review. Correct the missing details on the prescription, then come back. Medicines already in your schedule aren’t listed again.`
                : "Every medicine on your prescriptions is already in your schedule."
          }
          action={
            <Button asChild variant="outline">
              <Link href="/prescriptions">Go to prescriptions</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const groups = prescriptions.data.filter((rx) => all.some((o) => o.rx.id === rx.id));

  return (
    <div className="space-y-8">
      {back}
      {header}
      <form onSubmit={onSubmit} noValidate className="max-w-3xl space-y-10">
        {formError ? (
          <Alert tone="danger">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>It wasn’t added</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <fieldset id="medicine-group" tabIndex={-1} className="space-y-4" aria-describedby={errors.medicine ? "medicine-error" : undefined}>
          <legend className="text-lg font-semibold">Medicine</legend>
          {errors.medicine ? (
            <p id="medicine-error" className="text-destructive text-sm font-medium">
              {errors.medicine}
            </p>
          ) : null}
          {groups.map((rx) => (
            <div key={rx.id} className="space-y-2">
              <p className="text-muted-foreground text-sm">
                Prescription from {rx.prescriptionDate ? formatDate(rx.prescriptionDate) : formatDate(rx.createdAt)}
                {" · "}
                <Link href={`/prescriptions/${rx.id}`} className="text-info underline underline-offset-4">
                  view
                </Link>
              </p>
              <ul className="divide-y rounded-md border bg-card">
                {all
                  .filter((o) => o.rx.id === rx.id)
                  .map((o) => {
                    const disabled = o.reasons.length > 0 || o.already;
                    const id = `opt-${optionKey(o)}`;
                    return (
                      <li key={optionKey(o)} className="px-4 py-3">
                        <label htmlFor={id} className={`flex items-start gap-3 ${disabled ? "opacity-80" : "cursor-pointer"}`}>
                          <input
                            id={id}
                            type="radio"
                            name="medicine"
                            className="accent-primary mt-1 size-4"
                            disabled={disabled}
                            checked={selected === optionKey(o)}
                            onChange={() => choose(o)}
                          />
                          <span className="min-w-0 space-y-0.5">
                            <span className="block font-medium">
                              {o.med.name ?? "Unnamed medicine"} {o.med.strength ?? ""}
                            </span>
                            <span className="text-muted-foreground block text-sm">
                              {[o.med.dose, o.med.frequency, o.med.duration].filter(Boolean).join(" · ") || "No dose details"}
                            </span>
                            {o.already ? <span className="text-muted-foreground block text-sm">Already in your schedule</span> : null}
                            {o.reasons.length > 0 ? (
                              <span className="text-warning flex flex-wrap items-center gap-1 text-sm font-medium">
                                <FileSearch aria-hidden="true" className="size-4" /> Needs review: {o.reasons.join("; ").toLowerCase()}. Correct it on the prescription first.
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </fieldset>

        {chosen ? (
          <section aria-labelledby="when" className="space-y-5">
            <div className="max-w-prose space-y-1">
              <h2 id="when" className="text-lg">
                Reminders
              </h2>
              <p className="text-muted-foreground text-sm">
                Your prescription says: <span className="text-foreground font-medium">{[chosen.med.dose, chosen.med.frequency, chosen.med.duration].filter(Boolean).join(" · ")}</span>. Choose times that match it. Reminders
                don’t change what your prescription says.
              </p>
            </div>
            {suggestTimes(chosen.med.frequency) ? (
              <p className="text-muted-foreground text-sm">We suggested times from the prescription’s wording. Change them to suit your day.</p>
            ) : (
              <p className="text-muted-foreground text-sm">We couldn’t turn “{chosen.med.frequency}” into times automatically, so choose them yourself.</p>
            )}
            <TimesEditor
              times={times}
              error={errorFor(errors, "times")}
              onChange={(next) => {
                setTimesTouched(true);
                setTimes(next);
              }}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="startDate" label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} error={errors.startDate} />
              <TextField
                name="endDate"
                label="End date (optional)"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                hint={chosen.med.duration ? `Prescription duration: ${chosen.med.duration}` : "Leave empty if there’s no end date."}
                error={errors.endDate}
              />
            </div>
            {needsConfirmation ? (
              <div className="space-y-2">
                <label className="flex max-w-prose items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    aria-invalid={errors.confirmed ? true : undefined}
                    aria-describedby={errors.confirmed ? "confirm-error" : undefined}
                    className="accent-primary mt-0.5 size-5 shrink-0"
                  />
                  <span>I’ve checked this medicine, its strength, dose and how often, against my paper prescription.</span>
                </label>
                {errors.confirmed ? (
                  <p id="confirm-error" className="text-destructive text-sm font-medium">
                    {errors.confirmed}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">You entered these details yourself, so there’s nothing more to confirm.</p>
            )}
          </section>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? (
              <>
                <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Adding
              </>
            ) : (
              "Add to schedule"
            )}
          </Button>
          <Button asChild variant="outline">
            <Link href="/medications">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
