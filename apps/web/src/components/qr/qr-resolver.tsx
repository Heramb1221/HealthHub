"use client";

import { AlertTriangle, Clock, HeartPulse, LoaderCircle, LockKeyhole, PhoneCall, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { MedicationList } from "@/components/prescriptions/medication-list";
import { VerificationBadge } from "@/components/status/verification-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api/errors";
import { classifyQrReference, qrApi, type EmergencySummary, type SharedPrescription } from "@/lib/api/qr";
import { useResource } from "@/lib/use-resource";

type Resolved = { kind: "emergency"; data: EmergencySummary } | { kind: "session"; data: SharedPrescription };

function Frame({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 py-4" role="status" aria-live="polite">
      <div aria-hidden="true">{icon}</div>
      <h1 className="text-xl font-bold">{title}</h1>
      <div className="text-muted-foreground space-y-3 text-sm">{children}</div>
    </div>
  );
}

function Problem({ reference, error, onRetry }: { reference: string; error: unknown; onRetry: () => void }) {
  const signIn = (
    <Button asChild>
      <Link href={`/sign-in?next=${encodeURIComponent(`/qr/${reference}`)}`}>Sign in</Link>
    </Button>
  );
  if (isApiError(error)) {
    if (error.isUnauthenticated) {
      return (
        <Frame icon={<LockKeyhole className="text-accent-foreground size-10" />} title="Sign in to view this">
          <p>This QR code is protected. Medical details are never shown to people who aren&rsquo;t signed in.</p>
          <p>If you are the patient or an authorised care provider, sign in and you&rsquo;ll come straight back here.</p>
          {signIn}
        </Frame>
      );
    }
    if (error.isForbidden) {
      return (
        <Frame icon={<ShieldAlert className="text-destructive size-10" />} title="Not shared with your account">
          <p>You&rsquo;re signed in, but this item hasn&rsquo;t been shared with you. Ask the patient to share it, or sign in with a different account.</p>
          <Button asChild variant="outline">
            <Link href="/dashboard">Go to my dashboard</Link>
          </Button>
        </Frame>
      );
    }
    if (error.isNotFound) {
      return (
        <Frame icon={<ShieldAlert className="text-destructive size-10" />} title="This QR code can&rsquo;t be used">
          <p>It may have expired, been withdrawn by the patient, or it may not be a Sehat Meds code. For privacy we don&rsquo;t say which.</p>
          <p>Ask the patient to create a new one.</p>
        </Frame>
      );
    }
    if (error.status === 429) {
      return (
        <Frame icon={<Clock className="size-10" />} title="Too many lookups">
          <p>Please wait a minute and try again.</p>
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw aria-hidden="true" /> Try again
          </Button>
        </Frame>
      );
    }
  }
  return (
    <Frame icon={<AlertTriangle className="text-amber-500 size-10" />} title="Couldn&rsquo;t load this">
      <p>Check your connection and try again. Nothing was changed.</p>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw aria-hidden="true" /> Try again
      </Button>
    </Frame>
  );
}

function EmergencyView({ data }: { data: EmergencySummary }) {
  const phone = data.emergencyContact.phone;
  return (
    <div className="space-y-5 py-2">
      <div className="border-destructive/40 bg-destructive/10 rounded-lg border-2 p-5 text-center">
        <HeartPulse aria-hidden="true" className="text-destructive mx-auto size-10" />
        <h1 className="text-destructive mt-2 text-xl font-bold tracking-tight">Emergency medical information</h1>
        <p className="text-muted-foreground text-xs">Shown to the card holder or a signed-in care provider</p>
      </div>

      <section aria-label="Patient" className="bg-card space-y-3 rounded-xl border p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs font-medium">Patient</p>
            <p className="text-lg font-bold">{data.fullName || "Name not recorded"}</p>
          </div>
          <Badge tone="info" className="font-mono text-xs">
            {data.healthId}
          </Badge>
        </div>
        <div className="border-t pt-3">
          <p className="text-muted-foreground text-xs font-medium">Blood group</p>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{data.bloodGroup || "Not recorded"}</p>
        </div>
      </section>

      <section aria-label="Allergies" className="bg-card space-y-2 rounded-xl border p-5 shadow-[var(--shadow-soft)]">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle aria-hidden="true" className="size-4 text-amber-500" /> Allergies recorded by the patient
        </h2>
        {data.criticalAllergies.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {data.criticalAllergies.map((a) => (
              <Badge key={a} tone="danger" className="text-xs">
                {a}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">None recorded. This does not prove there are none.</p>
        )}
      </section>

      {phone ? (
        <section aria-label="Emergency contact" className="bg-card space-y-3 rounded-xl border p-5 shadow-[var(--shadow-soft)]">
          <h2 className="text-sm font-semibold">Emergency contact</h2>
          <p className="text-sm font-medium">
            {data.emergencyContact.name || "Contact person"}
            {data.emergencyContact.relationship ? ` (${data.emergencyContact.relationship})` : ""}
          </p>
          <p className="text-muted-foreground font-mono text-sm">{phone}</p>
          <Button asChild className="w-full">
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
              <PhoneCall aria-hidden="true" /> Call emergency contact
            </a>
          </Button>
        </section>
      ) : null}

      <Alert tone="neutral">
        <AlertTitle className="text-xs font-semibold">About this screen</AlertTitle>
        <AlertDescription className="text-[11px] leading-relaxed">
          {data.notice} Prescriptions and history stay private and need the patient&rsquo;s consent.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function SharedView({ data }: { data: SharedPrescription }) {
  const rx = data.prescription;
  const expires = new Date(data.session.expiresAt);
  return (
    <div className="space-y-5 py-2">
      <div className="space-y-1">
        <ShieldCheck aria-hidden="true" className="text-accent-foreground size-8" />
        <h1 className="text-xl font-bold">Shared prescription</h1>
        <p className="text-muted-foreground text-xs">
          Shared by the patient until {expires.toLocaleString()}. After that this link stops working.
        </p>
      </div>
      <Alert tone="warning">
        <AlertTitle className="text-xs font-semibold">Digitized copy, not an issued prescription</AlertTitle>
        <AlertDescription className="text-xs">
          This was read from a document the patient provided. Confirm against the original before acting on it.
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <VerificationBadge status={rx.verificationStatus} />
        {rx.prescriptionDate ? <span className="text-muted-foreground">Dated {rx.prescriptionDate}</span> : null}
        <span className="text-muted-foreground">Prescriber: {rx.prescriberName ?? "not stated"}</span>
      </div>
      <MedicationList medications={rx.medications} />
    </div>
  );
}

/**
 * Resolves a scanned `/qr/<reference>` with the visitor's own sign-in. The page itself never contains
 * medical data and nothing is fetched on the server without the visitor's credentials.
 */
export function QrResolver({ reference }: { reference: string }) {
  const kind = classifyQrReference(reference);
  const resource = useResource<Resolved>(
    async (signal) =>
      kind === "emergency"
        ? { kind: "emergency", data: await qrApi.emergency(reference, signal) }
        : { kind: "session", data: await qrApi.sharedPrescription(reference, signal) },
    `${kind}:${reference}`,
  );

  if (kind === "invalid") {
    return (
      <Frame icon={<ShieldAlert className="text-destructive size-10" />} title="This isn&rsquo;t a Sehat Meds QR code">
        <p>The code could not be recognised. Nothing was looked up.</p>
      </Frame>
    );
  }
  if (resource.status === "loading") {
    return (
      <div role="status" className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> Checking this QR code…
      </div>
    );
  }
  if (resource.status === "error") return <Problem reference={reference} error={resource.error} onRetry={resource.reload} />;
  const data = resource.data;
  return data.kind === "emergency" ? <EmergencyView data={data.data} /> : <SharedView data={data.data} />;
}
