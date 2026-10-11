"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, History, LoaderCircle, Plus, Stethoscope, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { isNoPatientError, NoPatientProfile } from "@/components/feedback/no-patient";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { TextField } from "@/components/forms/text-field";
import { TextareaField } from "@/components/forms/textarea-field";
import { PageHeader } from "@/components/layout/page-header";
import { DemoTag } from "@/components/status/demo-tag";
import { VerificationBadge } from "@/components/status/verification-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api/errors";
import { historyApi } from "@/lib/api/history";
import type { HistoryEntry, HistorySource } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { formValues, validate, type FieldErrors } from "@/lib/forms";
import { useResource } from "@/lib/use-resource";
import { conditionSchema } from "@/lib/validation/history";

const SOURCE_LABEL: Record<HistorySource, string> = {
  patient_reported: "Reported by you",
  prescription_scan: "From a scanned prescription",
};

type Filter = "all" | "condition" | "prescription";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "condition", label: "Conditions" },
  { value: "prescription", label: "Prescriptions" },
];

function yearOf(entry: HistoryEntry) {
  return (entry.occurredOn ?? entry.createdAt).slice(0, 4);
}

function EntryRow({ entry }: { entry: HistoryEntry }) {
  const Icon = entry.kind === "condition" ? Stethoscope : FileText;
  return (
    <li className="flex gap-4 py-4">
      <Icon aria-hidden="true" className="text-accent-foreground mt-1 size-5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{entry.title}</p>
        <p className="text-muted-foreground text-sm">
          {entry.occurredOn ? formatDate(entry.occurredOn) : "Date not provided"} · {SOURCE_LABEL[entry.source]}
        </p>
        {entry.description ? <p className="text-sm">{entry.description}</p> : null}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {entry.source === "patient_reported" ? <Badge>Not verified</Badge> : <VerificationBadge status={entry.verificationStatus} />}
          {entry.isDemo ? <DemoTag /> : null}
          {entry.relatedPrescriptionId ? (
            <Link href={`/prescriptions/${entry.relatedPrescriptionId}`} className="text-info text-sm underline underline-offset-4">
              Open prescription
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function AddConditionForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: (entry: HistoryEntry) => void }) {
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const ref = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    ref.current?.querySelector<HTMLInputElement>('[name="name"]')?.focus();
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);
    const result = validate(conditionSchema, formValues(form));
    if (!result.ok) {
      setErrors(result.errors);
      form.querySelector<HTMLElement>(`[name="${Object.keys(result.errors)[0]}"]`)?.focus();
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const entry = await historyApi.addCondition({ name: result.data.name, diagnosedOn: result.data.diagnosedOn, notes: result.data.notes });
      toast.success("Added to your history");
      onSaved(entry);
    } catch (error) {
      const { title, detail } = describeError(error);
      setFormError(`${title}. ${detail}`);
      setPending(false);
    }
  }

  return (
    <form ref={ref} onSubmit={onSubmit} noValidate className="bg-card max-w-2xl space-y-5 rounded-md border p-5">
      <h2 className="text-lg">Add a condition</h2>
      <p className="text-muted-foreground -mt-3 text-sm">It will be saved as reported by you and not verified.</p>
      {formError ? (
        <Alert tone="danger">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>It wasn’t added</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <TextField name="name" label="Condition" placeholder="e.g. Asthma" error={errors.name} />
      <TextField name="diagnosedOn" label="When it started (optional)" type="date" max={today} error={errors.diagnosedOn} />
      <TextareaField name="notes" label="Notes (optional)" error={errors.notes} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Adding
            </>
          ) : (
            "Add condition"
          )}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function HistoryView() {
  const history = useResource(() => historyApi.list(), "history");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [adding, setAdding] = React.useState(false);

  const addButton = (
    <Button onClick={() => setAdding(true)}>
      <Plus aria-hidden="true" /> Add a condition
    </Button>
  );

  if (adding && history.status === "ready") {
    return (
      <div className="space-y-6">
        <PageHeader title="Medical history" />
        <AddConditionForm
          onCancel={() => setAdding(false)}
          onSaved={(entry) => {
            history.setData([entry, ...history.data].sort((a, b) => (b.occurredOn ?? b.createdAt).localeCompare(a.occurredOn ?? a.createdAt)));
            setAdding(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Medical history"
        description="Conditions you report and prescriptions you upload, newest first. Each entry shows where it came from and whether it has been verified."
        actions={addButton}
      />

      {history.status === "loading" ? (
        <LoadingState label="Loading your history" rows={4} />
      ) : history.status === "error" ? (
        isNoPatientError(history.error) ? <NoPatientProfile /> : <ErrorState error={history.error} onRetry={history.reload} />
      ) : history.data.length === 0 ? (
        <EmptyState icon={History} title="Nothing in your history yet" description="Add a condition, or upload a prescription. Prescriptions you upload are added here automatically." action={addButton} />
      ) : (
        (() => {
          const shown = history.data.filter((e) => filter === "all" || e.kind === filter);
          const years = [...new Set(shown.map(yearOf))];
          return (
            <>
              <div role="group" aria-label="Filter history" className="flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                  <Button key={f.value} variant={filter === f.value ? "default" : "outline"} size="sm" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
                    {f.label}
                  </Button>
                ))}
              </div>
              {shown.length === 0 ? (
                <p className="text-muted-foreground text-sm">No {filter === "condition" ? "conditions" : "prescriptions"} in your history yet.</p>
              ) : (
                <div className="space-y-8">
                  {years.map((year) => (
                    <section key={year} aria-labelledby={`y-${year}`} className="grid gap-2 md:grid-cols-[6rem_1fr]">
                      <h2 id={`y-${year}`} className="text-muted-foreground pt-4 text-base font-semibold">
                        {year}
                      </h2>
                      <ul className="divide-y">
                        {shown.filter((e) => yearOf(e) === year).map((e) => (
                          <EntryRow key={e.id} entry={e} />
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
              <p role="status" className="text-muted-foreground text-sm">
                {shown.length === history.data.length
                  ? `Showing all ${shown.length} ${shown.length === 1 ? "entry" : "entries"}.`
                  : `Showing ${shown.length} of ${history.data.length} entries.`}
              </p>
            </>
          );
        })()
      )}
    </div>
  );
}
