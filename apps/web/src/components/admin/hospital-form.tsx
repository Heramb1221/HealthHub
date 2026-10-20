"use client";

import * as React from "react";
import Link from "next/link";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { TextareaField } from "@/components/forms/textarea-field";
import { TextField } from "@/components/forms/text-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeError, isApiError } from "@/lib/api/errors";
import type { Hospital, HospitalInput } from "@/lib/api/types";
import { focusFirstInvalid, formValues, validate, type FieldErrors } from "@/lib/forms";
import { hospitalSchema, toHospitalInput } from "@/lib/validation/hospital";

export function HospitalForm({
  initial,
  submitLabel,
  cancelHref,
  onSubmit,
}: {
  initial?: Hospital;
  submitLabel: string;
  cancelHref: string;
  onSubmit: (input: HospitalInput) => Promise<void>;
}) {
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function handle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);
    const result = validate(hospitalSchema, formValues(form));
    if (!result.ok) {
      setErrors(result.errors);
      focusFirstInvalid(form);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await onSubmit(toHospitalInput(result.data));
    } catch (error) {

      if (isApiError(error) && (error.status === 409 || error.status === 422)) {
        setFormError(error.message);
      } else {
        const { title, detail } = describeError(error);
        setFormError(`${title}. ${detail}`);
      }
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[data-form-error]")?.focus());
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handle} noValidate className="max-w-2xl space-y-6">
      {formError ? (
        <div data-form-error tabIndex={-1}>
          <Alert tone="danger">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Your changes weren’t saved</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <TextField name="name" label="Hospital name" defaultValue={initial?.name ?? ""} error={errors.name} autoComplete="off" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="city" label="City" defaultValue={initial?.city ?? ""} error={errors.city} autoComplete="off" />
        <TextField name="phone" label="Phone" type="tel" inputMode="tel" defaultValue={initial?.phone ?? ""} error={errors.phone} autoComplete="off" />
      </div>
      <TextareaField name="address" label="Address" defaultValue={initial?.address ?? ""} error={errors.address} />
      <TextareaField
        name="specialties"
        label="Specialities"
        hint="One per line. Only list what the hospital provides."
        defaultValue={(initial?.specialties ?? []).join("\n")}
        error={errors.specialties}
      />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Saving
            </>
          ) : (
            submitLabel
          )}
        </Button>
        <Button asChild variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
