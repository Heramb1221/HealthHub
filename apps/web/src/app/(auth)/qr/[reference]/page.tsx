import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, HeartPulse, PhoneCall, ShieldCheck, UserCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Props {
  params: Promise<{ reference: string }>;
}

export const metadata: Metadata = {
  title: "HealthHub Emergency & Health Card Access",
  robots: { index: false, follow: false },
};

interface EmergencyData {
  healthId: string;
  fullName: string | null;
  bloodGroup: string | null;
  criticalAllergies: string[];
  emergencyContact: {
    name: string | null;
    relationship: string | null;
    phone: string | null;
  };
  notice: string;
}

async function fetchEmergencyProfile(healthId: string): Promise<EmergencyData | null> {
  const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:4000";
  try {
    const res = await fetch(`${apiOrigin}/api/v1/qr/emergency/${encodeURIComponent(healthId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: EmergencyData };
    return json.data ?? null;
  } catch {
    return null;
  }
}

export default async function QrLandingPage(props: Props) {
  const { reference } = await props.params;
  const emergencyData = await fetchEmergencyProfile(reference);

  if (emergencyData) {
    return (
      <div className="mx-auto max-w-md space-y-6 py-4">

        <div className="border-destructive/40 bg-destructive/10 rounded-lg border-2 p-5 text-center">
          <HeartPulse className="text-destructive mx-auto size-10" />
          <h1 className="text-destructive mt-2 text-xl font-bold tracking-tight">
            Emergency Medical Information
          </h1>
          <p className="text-muted-foreground text-xs">
            HealthHub Verified Patient Emergency Profile
          </p>
        </div>

        <div className="bg-card border-border space-y-3 rounded-lg border p-5 shadow-xs">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-muted-foreground text-xs font-medium">Patient Full Name</p>
              <p className="text-lg font-bold">{emergencyData.fullName || "Unnamed Patient"}</p>
            </div>
            <Badge tone="info" className="font-mono text-xs">
              {emergencyData.healthId}
            </Badge>
          </div>

          <div className="border-border border-t pt-3">
            <p className="text-muted-foreground text-xs font-medium">Blood Group</p>
            <p className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {emergencyData.bloodGroup || "Not recorded"}
            </p>
          </div>
        </div>

        <div className="bg-card border-border space-y-2 rounded-lg border p-5 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-500" />
            <h2 className="text-sm font-semibold">Critical Medical Allergies</h2>
          </div>
          {emergencyData.criticalAllergies && emergencyData.criticalAllergies.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {emergencyData.criticalAllergies.map((allergy, idx) => (
                <Badge key={idx} tone="danger" className="text-xs">
                  {allergy}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">No known critical allergies reported.</p>
          )}
        </div>

        {emergencyData.emergencyContact?.phone ? (
          <div className="bg-card border-border space-y-3 rounded-lg border p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <UserCheck className="text-primary size-4" />
              <h2 className="text-sm font-semibold">Emergency Contact</h2>
            </div>
            <div className="text-xs space-y-1">
              <p className="font-medium text-foreground">
                {emergencyData.emergencyContact.name || "Emergency Contact Person"}
                {emergencyData.emergencyContact.relationship ? ` (${emergencyData.emergencyContact.relationship})` : ""}
              </p>
              <p className="text-muted-foreground font-mono">{emergencyData.emergencyContact.phone}</p>
            </div>
            <a
              href={`tel:${emergencyData.emergencyContact.phone.replace(/\s+/g, "")}`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-semibold shadow-xs"
            >
              <PhoneCall className="size-4" /> Call Emergency Contact
            </a>
          </div>
        ) : null}

        <Alert tone="neutral">
          <AlertTitle className="text-xs font-semibold">Privacy & Clinical Access Notice</AlertTitle>
          <AlertDescription className="text-[11px] leading-relaxed">
            This screen only reveals vital first-response details. Full medical prescriptions, diagnostic reports, and medical history remain private and require an authenticated healthcare provider account and patient consent.
          </AlertDescription>
        </Alert>

        <div className="text-center pt-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/sign-in">Clinician / Patient Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <ShieldCheck aria-hidden="true" className="text-accent-foreground size-10" />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">HealthHub Protected Health Card</h1>
        <p className="text-muted-foreground text-sm">
          This QR reference is protected and does not publicly expose private medical records.
        </p>
      </div>
      <div className="bg-card border-border space-y-2 rounded-md border p-4 text-xs leading-relaxed">
        <p className="font-semibold text-foreground">Authorization Required</p>
        <p className="text-muted-foreground">
          To inspect a patient’s full medical records or prescription history, HealthHub requires an authorized clinician session and verified patient consent.
        </p>
        <p className="text-muted-foreground">
          If you are the patient or an authorized provider, please sign in below.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/sign-in">Sign In</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">About HealthHub</Link>
        </Button>
      </div>
    </div>
  );
}
