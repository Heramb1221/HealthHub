"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck, CalendarDays, CircleCheck } from "lucide-react";
import { toast } from "sonner";

import { isNoPatientError, NoPatientProfile } from "@/components/feedback/no-patient";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { DemoTag } from "@/components/status/demo-tag";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { appointmentsApi } from "@/lib/api/appointments";
import { describeError } from "@/lib/api/errors";
import type { Appointment } from "@/lib/api/types";
import { formatDayLong, formatTime } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

function whenText(a: Appointment) {
  const start = new Date(a.startsAt);
  const end = a.endsAt ? ` to ${formatTime(new Date(a.endsAt))}` : "";
  return `${formatDayLong(start)}, ${formatTime(start)}${end}`;
}

function StatusBadge({ status }: { status: Appointment["status"] }) {
  if (status === "booked") return <Badge tone="success">Booked</Badge>;
  if (status === "cancelled") return <Badge>Cancelled</Badge>;
  return <Badge tone="info">Completed</Badge>;
}

/** Past and cancelled rows are read-only: they pass no handlers and never render the cancel controls. */
function Row({ a, cancellable = false, confirming = false, pending = false, onAskCancel, onKeep, onConfirm }: { a: Appointment; cancellable?: boolean; confirming?: boolean; pending?: boolean; onAskCancel?: () => void; onKeep?: () => void; onConfirm?: () => void }) {
  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2">
            <Link href={`/hospitals/${encodeURIComponent(a.hospitalId)}`} className="text-primary font-semibold underline-offset-4 hover:underline">
              {a.hospitalName}
            </Link>
            <StatusBadge status={a.status} />
            {a.isDemo ? <DemoTag /> : null}
          </p>
          <p className="text-sm">{whenText(a)}</p>
        </div>
        {cancellable && !confirming ? (
          <Button variant="outline" size="sm" onClick={onAskCancel} aria-label={`Cancel appointment at ${a.hospitalName}, ${whenText(a)}`}>
            Cancel appointment
          </Button>
        ) : null}
      </div>
      {confirming ? (
        <div className="bg-muted flex flex-col gap-3 rounded-md p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">Cancel this appointment? The time will be released for other people.</p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" disabled={pending} onClick={onConfirm}>
              Yes, cancel it
            </Button>
            <Button variant="outline" size="sm" autoFocus disabled={pending} onClick={onKeep}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function AppointmentsView({ justBookedId }: { justBookedId?: string }) {
  const [now] = React.useState(() => new Date());
  const appointments = useResource(() => appointmentsApi.list(), "appointments");
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function cancel(id: string) {
    setPending(true);
    try {
      const updated = await appointmentsApi.cancel(id);
      if (appointments.status === "ready") appointments.setData(appointments.data.map((a) => (a.id === id ? updated : a)));
      setConfirming(null);
      toast.success("Appointment cancelled");
    } catch (error) {
      const { title, detail } = describeError(error);
      toast.error("It wasn’t cancelled", { description: `${title}. ${detail}` });
    } finally {
      setPending(false);
    }
  }

  const findHospital = (
    <Button asChild>
      <Link href="/hospitals">Find a hospital</Link>
    </Button>
  );

  if (appointments.status === "loading") {
    return (
      <div className="space-y-6">
        <PageHeader title="Appointments" />
        <LoadingState label="Loading your appointments" rows={3} />
      </div>
    );
  }
  if (appointments.status === "error") {
    return (
      <div className="space-y-6">
        <PageHeader title="Appointments" />
        {isNoPatientError(appointments.error) ? <NoPatientProfile /> : <ErrorState error={appointments.error} onRetry={appointments.reload} />}
      </div>
    );
  }

  const list = appointments.data;
  const upcoming = list.filter((a) => a.status === "booked" && new Date(a.startsAt) >= now);
  const earlier = list.filter((a) => !upcoming.includes(a)).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const justBooked = justBookedId ? list.find((a) => a.id === justBookedId && a.status === "booked") : undefined;

  return (
    <div className="space-y-8">
      <PageHeader title="Appointments" description="Your booked, past and cancelled appointments." actions={findHospital} />

      {justBooked ? (
        <Alert tone="success" role="status">
          <CircleCheck aria-hidden="true" />
          <AlertTitle>Appointment booked</AlertTitle>
          <AlertDescription>
            <p>
              {justBooked.hospitalName}, {whenText(justBooked)}.
            </p>
            {justBooked.isDemo ? <p className="mt-1">This is a demo appointment saved in this browser. No hospital has received it.</p> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {list.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No appointments yet" description="Choose a hospital and one of its open times. Your appointment appears here once it’s booked." action={findHospital} />
      ) : (
        <>
          <section aria-labelledby="upcoming" className="space-y-3">
            <h2 id="upcoming" className="text-lg">
              Upcoming
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm">No upcoming appointments.</p>
            ) : (
              <ul className="bg-card divide-y rounded-md border">
                {upcoming.map((a) => (
                  <Row key={a.id} a={a} cancellable confirming={confirming === a.id} pending={pending} onAskCancel={() => setConfirming(a.id)} onKeep={() => setConfirming(null)} onConfirm={() => cancel(a.id)} />
                ))}
              </ul>
            )}
          </section>

          {earlier.length > 0 ? (
            <section aria-labelledby="earlier" className="space-y-3">
              <h2 id="earlier" className="text-lg">
                Past and cancelled
              </h2>
              <ul className="bg-card divide-y rounded-md border">
                {earlier.map((a) => (
                  <Row key={a.id} a={a} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <CalendarCheck aria-hidden="true" className="size-4" /> Times shown are in your device’s time zone.
      </p>
    </div>
  );
}
