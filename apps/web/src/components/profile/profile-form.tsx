"use client";

import * as React from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { SelectField } from "@/components/forms/select-field";
import { TextareaField } from "@/components/forms/textarea-field";
import { TextField } from "@/components/forms/text-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { patientsApi } from "@/lib/api/patients";
import { describeError } from "@/lib/api/errors";
import type { Patient } from "@/lib/api/types";
import { formValues, validate, type FieldErrors } from "@/lib/forms";
import { BLOOD_GROUPS, GENDER_OPTIONS, profileSchema, toUpdateInput } from "@/lib/validation/profile";

function Fieldset({ legend, description, children }: { legend: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-lg font-semibold">{legend}</legend>
      {description ? <p className="text-muted-foreground -mt-2 text-sm">{description}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function ProfileForm({
  patient,
  isOnboarding = false,
  onCancel,
  onSaved,
}: {
  patient: Patient;
  isOnboarding?: boolean;
  onCancel: () => void;
  onSaved: (patient: Patient) => void;
}) {
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const firstRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    firstRef.current?.querySelector<HTMLInputElement>('[name="fullName"]')?.focus();
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);
    const result = validate(profileSchema, formValues(form));
    if (!result.ok) {
      setErrors(result.errors);
      const first = Object.keys(result.errors)[0];
      form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const updated = await patientsApi.updateMe(toUpdateInput(result.data));
      // Confirm only after the API has accepted the change.
      toast.success("Profile saved");
      onSaved(updated);
    } catch (error) {
      const { title, detail } = describeError(error);
      const msg = detail && detail !== title ? detail : title;
      setFormError(msg);
      setPending(false);
    }
  }

  const ec = patient.emergencyContact;

  return (
    <form ref={firstRef} onSubmit={onSubmit} noValidate className="max-w-3xl space-y-10">
      {isOnboarding ? (
        <Alert tone="info">
          <AlertTitle>Welcome to HealthHub! Complete your profile</AlertTitle>
          <AlertDescription>
            Please fill in your legal name, date of birth, blood group, and emergency contact to activate your patient account and unlock appointments, prescriptions, and health records.
          </AlertDescription>
        </Alert>
      ) : null}

      {formError ? (
        <Alert tone="danger">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Your changes weren’t saved</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Fieldset legend="Identity">
        <TextField name="fullName" label="Full name" autoComplete="name" defaultValue={patient.fullName} error={errors.fullName} className="sm:col-span-2" />
        <TextField name="dateOfBirth" label="Date of birth" type="date" max={today} autoComplete="bday" defaultValue={patient.dateOfBirth ?? ""} error={errors.dateOfBirth} />
        <SelectField name="gender" label="Gender" options={GENDER_OPTIONS} defaultValue={patient.gender ?? ""} error={errors.gender} />
        <SelectField
          name="bloodGroup"
          label="Blood group"
          options={BLOOD_GROUPS.map((g) => ({ value: g, label: g }))}
          defaultValue={patient.bloodGroup ?? ""}
          error={errors.bloodGroup}
        />
      </Fieldset>

      <Fieldset legend="Contact" description="Your email comes from your account and can’t be changed here.">
        <TextField name="phone" label="Phone" type="tel" autoComplete="tel" inputMode="tel" defaultValue={patient.phone ?? ""} error={errors.phone} />
        <TextField name="email" label="Email" type="email" value={patient.email ?? ""} readOnly disabled />
        <TextareaField name="address" label="Address" autoComplete="street-address" defaultValue={patient.address ?? ""} error={errors.address} className="sm:col-span-2" />
      </Fieldset>

      <Fieldset legend="Emergency contact" description="Add a name and phone number if you add a contact.">
        <TextField name="emergencyName" label="Name" defaultValue={ec.name ?? ""} error={errors.emergencyName} />
        <TextField name="emergencyRelationship" label="Relationship" defaultValue={ec.relationship ?? ""} error={errors.emergencyRelationship} />
        <TextField name="emergencyPhone" label="Phone" type="tel" inputMode="tel" defaultValue={ec.phone ?? ""} error={errors.emergencyPhone} />
      </Fieldset>

      <Fieldset legend="Health information" description="Enter one item per line. This is self-reported and isn’t verified.">
        <TextareaField name="allergies" label="Allergies" defaultValue={patient.allergies.join("\n")} error={errors.allergies} className="sm:col-span-2" />
        <TextareaField name="conditions" label="Existing conditions" defaultValue={patient.conditions.join("\n")} error={errors.conditions} className="sm:col-span-2" />
        <TextareaField name="currentMedications" label="Current medicines" defaultValue={patient.currentMedications.join("\n")} error={errors.currentMedications} className="sm:col-span-2" />
      </Fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Saving
            </>
          ) : isOnboarding ? (
            "Complete Profile & Continue"
          ) : (
            "Save changes"
          )}
        </Button>
        {!isOnboarding ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
