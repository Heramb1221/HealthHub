"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, CalendarDays, FileText, ShieldAlert, UserRound } from "lucide-react";

import { EmptyState, ErrorState } from "@/components/feedback/states";
import { LoadingState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { HealthId } from "@/components/profile/health-id";
import { DemoTag } from "@/components/status/demo-tag";
import { ProcessingBadge, VerificationBadge } from "@/components/status/verification-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { appointmentsApi } from "@/lib/api/appointments";
import { isApiError } from "@/lib/api/errors";
import { medicationSchedulesApi } from "@/lib/api/medication-schedules";
import { patientsApi } from "@/lib/api/patients";
import { prescriptionsApi } from "@/lib/api/prescriptions";
import type { Appointment } from "@/lib/api/types";
import { formatDate, formatWhen } from "@/lib/format";
import { buildNotices, type Notice } from "@/lib/notices";
import { nextReminder } from "@/lib/schedule";
import { useResource, type Resource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

function Row({ icon: Icon, title, demo, children }: { icon: typeof FileText; title: string; demo?: boolean; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="flex gap-4 py-5 first:pt-0 last:pb-0">
      <Icon aria-hidden="true" className="text-accent-foreground mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={id} className="text-muted-foreground text-sm font-medium">
            {title}
          </h2>
          {demo ? <DemoTag /> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

function Section<T>({ resource, title, icon, loadingLabel, children }: { resource: Resource<T> & { reload: () => void }; title: string; icon: typeof FileText; loadingLabel: string; children: (data: T) => { demo?: boolean; body: React.ReactNode } }) {
  if (resource.status === "loading") {
    return (
      <Row icon={icon} title={title}>
        <LoadingState label={loadingLabel} rows={1} />
      </Row>
    );
  }
  if (resource.status === "error") {
    return (
      <Row icon={icon} title={title}>
        <ErrorState error={resource.error} onRetry={resource.reload} />
      </Row>
    );
  }
  const { demo, body } = children(resource.data);
  return (
    <Row icon={icon} title={title} demo={demo}>
      {body}
    </Row>
  );
}

function NoticeList({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) {
    return <p className="text-muted-foreground text-sm">Nothing in your records needs attention right now.</p>;
  }
  const edge: Record<Notice["tone"], string> = {
    neutral: "border-border",
    info: "border-info",
    success: "border-success",
    warning: "border-warning",
    danger: "border-destructive",
    demo: "border-demo",
  };
  return (
    <ul className="space-y-4">
      {notices.map(({ id, tone, icon: Icon, title, body, action }) => (
        <li key={id} className={cn("flex gap-3 border-l-2 pl-3", edge[tone])}>
          <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-muted-foreground text-sm">{body}</p>
            {action ? (
              <Link href={action.href} className="text-info text-sm font-medium underline underline-offset-4">
                {action.label}
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function upcoming(appointments: Appointment[], now: Date): Appointment | null {
  return (
    appointments
      .filter((a) => a.status === "booked" && new Date(a.startsAt) >= now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null
  );
}

export function DashboardView() {
  const [now] = React.useState(() => new Date());
  const patient = useResource(() => patientsApi.getMe(), "patient");
  const prescriptions = useResource(() => prescriptionsApi.list(), "prescriptions");
  const schedules = useResource(() => medicationSchedulesApi.list(), "schedules");
  const appointments = useResource(() => appointmentsApi.list(), "appointments");

  const latestCompletedRx =
    prescriptions.status === "ready"
      ? prescriptions.data.find((p) => p.processingStatus === "completed")
      : null;

  const contraindications = useResource(
    () => (latestCompletedRx ? prescriptionsApi.contraindications(latestCompletedRx.id) : Promise.resolve(null)),
    latestCompletedRx?.id ? `dash-contra:${latestCompletedRx.id}` : "dash-contra:none",
  );

  // An account with no patient profile (e.g. the administrator) gets a clear explanation instead of four errors.
  if (patient.status === "error" && isApiError(patient.error) && patient.error.isNotFound) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        <EmptyState
          icon={UserRound}
          title="This account has no patient profile"
          description="Patient records, reminders and appointments belong to patient accounts. Sign in with a patient account to see them."
        />
      </div>
    );
  }

  const notices: Notice[] | null =
    patient.status === "ready" && prescriptions.status === "ready"
      ? buildNotices(patient.data, prescriptions.data, contraindications.status === "ready" ? contraindications.data : null)
      : null;

  const contraReport = contraindications.status === "ready" ? contraindications.data : null;
  const hasInteractions = Boolean(contraReport?.hasInteractions && contraReport.alerts.length > 0);
  const hasHighRisk = Boolean(contraReport?.alerts.some((a) => a.severity === "high"));

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" description="What’s coming up and what needs your attention." />

      <section aria-labelledby="identity" className="bg-card flex flex-col gap-3 rounded-md border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="identity" className="sr-only">
          Your identity
        </h2>
        {patient.status === "ready" ? (
          <>
            <div className="min-w-0 space-y-1">
              <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                {patient.data.fullName || "Unnamed profile"}
                {patient.data.isDemo ? <DemoTag /> : null}
              </p>
              <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
                HealthHub ID <HealthId value={patient.data.healthId} />
              </p>
            </div>
            <div className="flex flex-wrap gap-2 self-start sm:self-center">
              <Button asChild variant="outline" size="sm">
                <Link href="/symptoms">Check symptoms</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/insurance">Insurance</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/health-card">Health card</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/profile">View profile</Link>
              </Button>
            </div>
          </>
        ) : patient.status === "error" ? (
          <ErrorState error={patient.error} onRetry={patient.reload} />
        ) : (
          <LoadingState label="Loading your profile" rows={1} />
        )}
      </section>

      {hasInteractions && latestCompletedRx && contraReport ? (
        <section aria-labelledby="contraindications-banner" className="space-y-3">
          <Alert tone={hasHighRisk ? "danger" : "warning"} className="p-5 shadow-sm">
            <ShieldAlert className="size-5 mt-0.5" aria-hidden="true" />
            <div className="space-y-2 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <AlertTitle className="text-base font-semibold flex items-center gap-2">
                  Prescription Safety Alert: {hasHighRisk ? "High-Risk Interactions Detected" : "Drug Interaction Caution"}
                </AlertTitle>
                <Badge tone={hasHighRisk ? "danger" : "warning"}>
                  {contraReport.alerts.length} {contraReport.alerts.length === 1 ? "Precaution" : "Precautions"}
                </Badge>
              </div>
              <AlertDescription className="space-y-3">
                <p className="text-sm font-medium leading-relaxed">
                  {contraReport.summary}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 pt-1">
                  {contraReport.alerts.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-md border border-border bg-card/90 p-3 text-xs text-foreground space-y-1 shadow-xs"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold line-clamp-1">{a.title}</span>
                        <Badge tone={a.severity === "high" ? "danger" : "warning"} className="text-[10px] uppercase">
                          {a.severity}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">Medicines: </span>
                        {a.medications.join(", ")}
                      </div>
                      <p className="text-muted-foreground line-clamp-2 pt-0.5">{a.patientAdvice}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground italic">
                    Do not discontinue or alter medications on your own. Discuss these findings with your prescribing doctor.
                  </p>
                  <Button asChild size="sm" variant={hasHighRisk ? "default" : "outline"}>
                    <Link href={`/prescriptions/${latestCompletedRx.id}`}>
                      View Full Safety Report
                    </Link>
                  </Button>
                </div>
              </AlertDescription>
            </div>
          </Alert>
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="bg-card divide-y rounded-md border px-5 py-5">
          <Section resource={schedules} title="Next medication reminder" icon={CalendarClock} loadingLabel="Loading reminders">
            {(data) => {
              const next = nextReminder(data, now);
              return {
                demo: next?.schedule.isDemo,
                body: next ? (
                  <>
                    <p className="font-medium">
                      {next.schedule.medicationName}
                      {next.schedule.strength ? ` ${next.schedule.strength}` : ""}
                      <span className="text-muted-foreground font-normal"> · {next.schedule.dose}</span>
                    </p>
                    <p className="text-sm">{formatWhen(next.at, now)}</p>
                    <Link href="/medications" className="text-info inline-block pt-1 text-sm font-medium underline underline-offset-4">
                      Open schedule
                    </Link>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No upcoming reminders.{" "}
                    <Link href="/medications" className="text-info font-medium underline underline-offset-4">
                      Open your schedule
                    </Link>{" "}
                    to add a reviewed medicine.
                  </p>
                ),
              };
            }}
          </Section>

          <Section resource={appointments} title="Next appointment" icon={CalendarDays} loadingLabel="Loading appointments">
            {(data) => {
              const next = upcoming(data, now);
              return {
                demo: next?.isDemo,
                body: next ? (
                  <>
                    <p className="font-medium">{next.hospitalName}</p>
                    <p className="text-sm">{formatWhen(new Date(next.startsAt), now)}</p>
                    <Link href="/appointments" className="text-info inline-block pt-1 text-sm font-medium underline underline-offset-4">
                      View appointments
                    </Link>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No upcoming appointments.{" "}
                    <Link href="/hospitals" className="text-info font-medium underline underline-offset-4">
                      Find a hospital
                    </Link>
                  </p>
                ),
              };
            }}
          </Section>

          <Section resource={prescriptions} title="Latest prescription" icon={FileText} loadingLabel="Loading prescriptions">
            {(data) => {
              const latest = data[0];
              return {
                demo: latest?.isDemo,
                body: latest ? (
                  <>
                    <p className="font-medium">{latest.prescriptionDate ? formatDate(latest.prescriptionDate) : "Undated prescription"}</p>
                    <p className="text-muted-foreground text-sm">
                      {latest.prescriberName ? `${latest.prescriberName} · ` : ""}
                      {latest.medications.length} {latest.medications.length === 1 ? "medicine" : "medicines"} listed
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {/* Once reading has finished, the status that matters is verification; "reading finished" is just noise. */}
                      {latest.processingStatus !== "completed" ? <ProcessingBadge status={latest.processingStatus} /> : null}
                      {latest.processingStatus === "completed" ? <VerificationBadge status={latest.verificationStatus} /> : null}
                    </div>
                    <Link href={`/prescriptions/${latest.id}`} className="text-info inline-block pt-1 text-sm font-medium underline underline-offset-4">
                      Open prescription
                    </Link>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No prescriptions yet.{" "}
                    <Link href="/prescriptions/new" className="text-info font-medium underline underline-offset-4">
                      Upload one
                    </Link>{" "}
                    to see its review status here.
                  </p>
                ),
              };
            }}
          </Section>
        </div>

        <aside aria-labelledby="notices" className="order-first space-y-4 lg:order-none">
          <h2 id="notices" className="text-base">
            Notices
          </h2>
          {notices ? (
            <NoticeList notices={notices} />
          ) : patient.status === "error" || prescriptions.status === "error" ? (
            <p className="text-muted-foreground text-sm">Notices will appear once your profile and prescriptions have loaded.</p>
          ) : (
            <LoadingState label="Loading notices" rows={2} />
          )}
        </aside>
      </div>
    </div>
  );
}
