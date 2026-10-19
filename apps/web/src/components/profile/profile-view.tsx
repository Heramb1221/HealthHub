"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, UserRound } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { FamilyLinks } from "@/components/profile/family-links";
import { HealthId } from "@/components/profile/health-id";
import { ProfileForm } from "@/components/profile/profile-form";
import { DemoTag } from "@/components/status/demo-tag";
import { Button } from "@/components/ui/button";
import { patientsApi } from "@/lib/api/patients";
import { isApiError } from "@/lib/api/errors";
import type { Patient } from "@/lib/api/types";
import { formatDate, orBlank } from "@/lib/format";
import { GENDER_OPTIONS } from "@/lib/validation/profile";
import { useResource } from "@/lib/use-resource";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function ListValue({ items }: { items?: string[] | null }) {
  if (!items || items.length === 0) return <span className="text-muted-foreground">None recorded</span>;
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="space-y-1">
      <h2 id={id} className="text-lg">
        {title}
      </h2>
      {note ? <p className="text-muted-foreground text-sm">{note}</p> : null}
      <dl className="divide-y">{children}</dl>
    </section>
  );
}

function genderLabel(value: Patient["gender"]) {
  return GENDER_OPTIONS.find((o) => o.value === value)?.label ?? "Not provided";
}

export function ProfileView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patient = useResource(() => patientsApi.getMe(), "patient");
  const [editing, setEditing] = React.useState(false);

  const p = patient.status === "ready" ? patient.data : null;
  const isOnboarding = searchParams?.get("onboarding") === "true" || (p !== null && !p.fullName);
  const isEditing = editing || isOnboarding;

  if (patient.status === "loading") {
    return (
      <div className="space-y-6">
        <PageHeader title="Profile" />
        <LoadingState label="Loading your profile" rows={4} />
      </div>
    );
  }

  if (patient.status === "error") {
    if (isApiError(patient.error) && patient.error.isNotFound) {
      return (
        <div className="space-y-6">
          <PageHeader title="Profile" />
          <EmptyState icon={UserRound} title="This account has no patient profile" description="Sign in with a patient account to view or edit a health profile." />
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Profile" />
        <ErrorState error={patient.error} onRetry={patient.reload} />
      </div>
    );
  }

  if (!p) return null;

  if (isEditing) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={isOnboarding ? "Complete your profile" : "Edit profile"}
          description={
            isOnboarding
              ? "Fill in your basic information to complete account registration."
              : "Changes are saved to your HealthHub medical profile when you select Save changes."
          }
        />
        <ProfileForm
          patient={p}
          isOnboarding={isOnboarding}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            patient.setData(updated);
            setEditing(false);
            if (isOnboarding) {
              toast.success("Profile setup complete! Welcome to HealthHub.");
              router.push("/dashboard");
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title="Profile"
        description="Everything here is self-reported. It has not been verified by a clinician."
        actions={
          <Button onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" /> Edit profile
          </Button>
        }
      />

      <Group title="Identity">
        <Field label="Sehat Med ID">
          <span className="flex flex-wrap items-center gap-2">
            <HealthId value={p.healthId} />
            {p.isDemo ? <DemoTag /> : null}
          </span>
        </Field>
        <Field label="Full name">{orBlank(p.fullName)}</Field>
        <Field label="Date of birth">{formatDate(p.dateOfBirth)}</Field>
        <Field label="Gender">{genderLabel(p.gender)}</Field>
        <Field label="Blood group">{orBlank(p.bloodGroup)}</Field>
      </Group>

      <Group title="Contact">
        <Field label="Phone">{orBlank(p.phone)}</Field>
        <Field label="Email">{orBlank(p.email)}</Field>
        <Field label="Address">{orBlank(p.address)}</Field>
      </Group>

      <Group title="Emergency contact">
        <Field label="Name">{orBlank(p.emergencyContact.name)}</Field>
        <Field label="Relationship">{orBlank(p.emergencyContact.relationship)}</Field>
        <Field label="Phone">{orBlank(p.emergencyContact.phone)}</Field>
      </Group>

      <Group title="Health information" note="Entered by you. Your medical history timeline shows the source and verification of each record.">
        <Field label="Allergies">
          <ListValue items={p.allergies} />
        </Field>
        <Field label="Existing conditions">
          <ListValue items={p.conditions ?? (p as unknown as { existingConditions?: string[] }).existingConditions ?? []} />
        </Field>
        <Field label="Current medicines">
          <ListValue items={p.currentMedications} />
        </Field>
      </Group>

      <FamilyLinks />
    </div>
  );
}
