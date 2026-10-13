"use client";

import Link from "next/link";
import { ArrowLeft, CalendarX, Info } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { DemoTag } from "@/components/status/demo-tag";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { IS_DEMO } from "@/lib/api/config";
import { isApiError } from "@/lib/api/errors";
import { hospitalsApi } from "@/lib/api/hospitals";
import type { AvailabilitySlot } from "@/lib/api/types";
import { formatDayLong, formatTime } from "@/lib/format";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useResource } from "@/lib/use-resource";

function groupByDay(slots: AvailabilitySlot[]) {
  const days: { key: string; date: Date; slots: AvailabilitySlot[] }[] = [];
  for (const slot of slots) {
    const d = new Date(slot.startsAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const last = days[days.length - 1];
    if (last?.key === key) last.slots.push(slot);
    else days.push({ key, date: d, slots: [slot] });
  }
  return days;
}

/**
 * Read-only view of the times patients can currently book. The API contract has no admin slot endpoints, so
 * nothing can be created or changed here. It deliberately shows open times only: which times are booked, and by
 * whom, is patient information that administrators don't get (docs/PRODUCT_SPEC.md).
 */
export function AdminSlotsView({ id }: { id: string }) {
  const hospital = useResource(() => hospitalsApi.get(id), id);
  const slots = useResource(() => hospitalsApi.availability(id), `${id}:slots`);
  useDocumentTitle(hospital.status === "ready" ? `Open times · ${hospital.data.name} · Admin` : null);

  const back = (
    <Link href={`/admin/hospitals/${encodeURIComponent(id)}`} className="text-info inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" /> Back to hospital
    </Link>
  );

  if (hospital.status === "loading") {
    return (
      <div className="space-y-6">
        {back}
        <LoadingState label="Loading hospital" rows={3} />
      </div>
    );
  }
  if (hospital.status === "error") {
    return (
      <div className="space-y-6">
        {back}
        {isApiError(hospital.error) && hospital.error.isNotFound ? <EmptyState title="Hospital not found" description="It may have been removed." /> : <ErrorState error={hospital.error} onRetry={hospital.reload} />}
      </div>
    );
  }

  const h = hospital.data;
  const days = slots.status === "ready" ? groupByDay(slots.data) : [];

  return (
    <div className="space-y-8">
      {back}
      <PageHeader title="Open times" description={h.name} />
      <div className="-mt-4 flex flex-wrap items-center gap-2">
        {h.active ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>}
        {h.isDemo ? <DemoTag /> : null}
      </div>

      <Alert tone="info">
        <Info aria-hidden="true" />
        <AlertTitle>Read-only: times can’t be added or changed yet</AlertTitle>
        <AlertDescription>
          <p>
            The API has no way to create or edit appointment times, so this shows the times patients can book right now. Booked times, and who booked them, aren’t shown to
            administrators.
            {IS_DEMO ? " In demo mode, hospitals you add get a standard set of sample times." : ""}
          </p>
        </AlertDescription>
      </Alert>

      {slots.status === "loading" ? (
        <LoadingState label="Loading open times" rows={3} />
      ) : slots.status === "error" ? (
        <ErrorState error={slots.error} onRetry={slots.reload} />
      ) : !h.active ? (
        <EmptyState icon={CalendarX} title="No times are offered" description="This hospital is deactivated, so patients aren’t offered any times." />
      ) : days.length === 0 ? (
        <EmptyState icon={CalendarX} title="No open times" description="Every listed time is taken, or none have been added." />
      ) : (
        <section aria-labelledby="open" className="space-y-4">
          <h2 id="open" className="text-lg">
            {slots.status === "ready" ? slots.data.length : 0} open {slots.status === "ready" && slots.data.length === 1 ? "time" : "times"} over {days.length} {days.length === 1 ? "day" : "days"}
          </h2>
          <dl className="bg-card divide-y rounded-md border">
            {days.map((day) => (
              <div key={day.key} className="grid gap-2 px-5 py-3 sm:grid-cols-[14rem_1fr]">
                <dt className="text-sm font-medium">{formatDayLong(day.date)}</dt>
                <dd className="flex flex-wrap gap-2">
                  {day.slots.map((s) => (
                    <span key={s.id} className="bg-muted rounded-sm px-2 py-1 text-sm tabular-nums">
                      {formatTime(new Date(s.startsAt))}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
