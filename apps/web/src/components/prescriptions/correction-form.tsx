"use client";

import * as React from "react";
import { LoaderCircle, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { TextField } from "@/components/forms/text-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api/errors";
import { prescriptionsApi } from "@/lib/api/prescriptions";
import type { Prescription } from "@/lib/api/types";
import { validateByPath, type FieldErrors } from "@/lib/forms";
import { medicationReviewReasons, REVIEW_REASON_LABEL } from "@/lib/prescription-safety";
import { correctionSchema } from "@/lib/validation/prescription";

type RowFields = "name" | "strength" | "dose" | "route" | "frequency" | "duration" | "instructions";
interface Row extends Record<RowFields, string> {
  key: string;
  /** Reasons the original reading was unclear, shown to help the patient know where to look. */
  unclear: string[];
}

const toText = (v: string | null | undefined) => v ?? "";
let rowCounter = 0;
const nextKey = () => `row-${++rowCounter}`;

function rowsFrom(rx: Prescription): Row[] {
  return rx.medications.map((m) => ({
    key: nextKey(),
    name: toText(m.name),
    strength: toText(m.strength),
    dose: toText(m.dose),
    route: toText(m.route),
    frequency: toText(m.frequency),
    duration: toText(m.duration),
    instructions: toText(m.instructions),
    unclear: m.source === "patient_entered" ? [] : medicationReviewReasons(m).map((r) => REVIEW_REASON_LABEL[r]),
  }));
}

function blankRow(): Row {
  return { key: nextKey(), name: "", strength: "", dose: "", route: "", frequency: "", duration: "", instructions: "", unclear: [] };
}

export function CorrectionForm({ prescription, onCancel, onSaved }: { prescription: Prescription; onCancel: () => void; onSaved: (rx: Prescription) => void }) {
  const [rows, setRows] = React.useState<Row[]>(() => rowsFrom(prescription));
  const [date, setDate] = React.useState(prescription.prescriptionDate ?? "");
  const [prescriber, setPrescriber] = React.useState(prescription.prescriberName ?? "");
  const [confirmed, setConfirmed] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const addRef = React.useRef<HTMLButtonElement>(null);
  const focusKey = React.useRef<string | null>(null);
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  React.useEffect(() => {
    if (focusKey.current) {
      formRef.current?.querySelector<HTMLInputElement>(`[data-row="${focusKey.current}"] input[name="name"]`)?.focus();
      focusKey.current = null;
    }
  }, [rows.length]);

  function update(key: string, field: RowFields, value: string) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const result = validateByPath(correctionSchema, {
      prescriptionDate: date,
      prescriberName: prescriber,
      medications: rows.map((r) => ({
        name: r.name,
        strength: r.strength,
        dose: r.dose,
        route: r.route,
        frequency: r.frequency,
        duration: r.duration,
        instructions: r.instructions,
      })),
      confirmed,
    });
    if (!result.ok) {
      setErrors(result.errors);
      const first = Object.keys(result.errors)[0];
      const match = /^medications\.(\d+)\.(\w+)$/.exec(first);
      const target = match
        ? formRef.current?.querySelector<HTMLElement>(`[data-row="${rows[Number(match[1])]?.key}"] [name="${match[2]}"]`)
        : formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`);
      target?.focus();
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { prescriptionDate, prescriberName, medications } = result.data;
      const updated = await prescriptionsApi.correct(prescription.id, { prescriptionDate, prescriberName, medications });
      toast.success("Correction saved", { description: "Marked as corrected by you. It isn’t verified by a clinician." });
      onSaved(updated);
    } catch (error) {
      const { title, detail } = describeError(error);
      setFormError(`${title}. ${detail}`);
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-8">
      {formError ? (
        <Alert tone="danger">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Your correction wasn’t saved</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-lg font-semibold">Prescription</legend>
        <TextField name="prescriptionDate" label="Prescription date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} error={errors.prescriptionDate} />
        <TextField name="prescriberName" label="Prescriber" placeholder="e.g. Dr. A. Sharma" value={prescriber} onChange={(e) => setPrescriber(e.target.value)} error={errors.prescriberName} />
      </fieldset>

      <section aria-labelledby="meds-heading" className="space-y-4">
        <div className="max-w-prose space-y-1">
          <h2 id="meds-heading" className="text-lg">
            Medicines
          </h2>
          <p className="text-muted-foreground text-sm">Compare each line with your paper prescription. Leave a box empty if the prescription doesn’t say. Don’t guess.</p>
        </div>
        {errors["medications"] ? (
          <p className="text-destructive text-sm font-medium" role="alert">
            {errors["medications"]}
          </p>
        ) : null}
        <ul className="space-y-4">
          {rows.map((row, i) => (
            <li key={row.key} data-row={row.key} className="bg-card rounded-md border p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-base">Medicine {i + 1}</h3>
                  {row.unclear.length ? <p className="text-warning text-sm">Unclear in the scan: {row.unclear.join("; ").toLowerCase()}.</p> : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={rows.length === 1}
                  onClick={() => {
                    setRows((current) => current.filter((r) => r.key !== row.key));
                    addRef.current?.focus();
                  }}
                  aria-label={`Remove medicine ${i + 1}`}
                >
                  <Trash2 aria-hidden="true" /> Remove
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextField name="name" label="Medicine name" value={row.name} onChange={(e) => update(row.key, "name", e.target.value)} error={errors[`medications.${i}.name`]} />
                <TextField name="strength" label="Strength" placeholder="e.g. 500 mg" value={row.strength} onChange={(e) => update(row.key, "strength", e.target.value)} error={errors[`medications.${i}.strength`]} />
                <TextField name="dose" label="Dose" placeholder="e.g. 1 tablet" value={row.dose} onChange={(e) => update(row.key, "dose", e.target.value)} error={errors[`medications.${i}.dose`]} />
                <TextField name="frequency" label="How often" placeholder="e.g. Twice a day" value={row.frequency} onChange={(e) => update(row.key, "frequency", e.target.value)} error={errors[`medications.${i}.frequency`]} />
                <TextField name="duration" label="Duration" placeholder="e.g. 5 days" value={row.duration} onChange={(e) => update(row.key, "duration", e.target.value)} error={errors[`medications.${i}.duration`]} />
                <TextField name="route" label="Route" placeholder="e.g. oral" value={row.route} onChange={(e) => update(row.key, "route", e.target.value)} error={errors[`medications.${i}.route`]} />
                <TextField name="instructions" label="Instructions" placeholder="e.g. After food" value={row.instructions} onChange={(e) => update(row.key, "instructions", e.target.value)} error={errors[`medications.${i}.instructions`]} className="sm:col-span-2 lg:col-span-3" />
              </div>
            </li>
          ))}
        </ul>
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          onClick={() => {
            const row = blankRow();
            focusKey.current = row.key;
            setRows((current) => [...current, row]);
          }}
        >
          <Plus aria-hidden="true" /> Add a medicine
        </Button>
      </section>

      <div className="space-y-2">
        <label className="flex max-w-prose items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="confirmed"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            aria-invalid={errors.confirmed ? true : undefined}
            aria-describedby={errors.confirmed ? "confirmed-error" : undefined}
            className="accent-primary mt-0.5 size-5 shrink-0"
          />
          <span>I’ve checked these details against my paper prescription. I understand that saving them doesn’t make them verified by a clinician.</span>
        </label>
        {errors.confirmed ? (
          <p id="confirmed-error" className="text-destructive text-sm font-medium">
            {errors.confirmed}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Saving
            </>
          ) : (
            "Save correction"
          )}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
