"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarX, Clock, ExternalLink, Globe, Info, LoaderCircle, MapPin, Star, TriangleAlert } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { SlotPicker } from "@/components/hospitals/slot-picker";
import { HospitalReviews } from "@/components/hospitals/hospital-reviews";
import { DemoTag } from "@/components/status/demo-tag";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { appointmentsApi } from "@/lib/api/appointments";
import { IS_DEMO } from "@/lib/api/config";
import { describeError, isApiError } from "@/lib/api/errors";
import { hospitalsApi } from "@/lib/api/hospitals";
import { formatDayLong, formatTime } from "@/lib/format";
import { toast } from "sonner";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useResource } from "@/lib/use-resource";
import type { AvailabilitySlot } from "@/lib/api/types";

export function HospitalDetail({ id }: { id: string }) {
  const router = useRouter();
  const hospital = useResource(() => hospitalsApi.get(id), id);
  const active = hospital.status === "ready" && Boolean(hospital.data.active ?? hospital.data.isActive ?? true);
  const availability = useResource(() => (active ? hospitalsApi.availability(id) : Promise.resolve([])), `${id}:${active}`);

  useDocumentTitle(hospital.status === "ready" ? hospital.data.name : null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: "warning" | "danger"; title: string; body: string } | null>(null);
  const noticeRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      void availability.reload();
    }, 4000);
    return () => clearInterval(interval);
  }, [active, availability]);

  const back = (
    <Link href="/hospitals" className="text-info inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" /> All hospitals
    </Link>
  );

  React.useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  async function handleSelectSlot(slot: AvailabilitySlot) {
    if (selected === slot.id) return;
    try {
      const res = await hospitalsApi.holdSlot(id, slot.id);
      setSelected(slot.id);
      setHoldExpiresAt(res.expiresAt);
      toast.success("15-minute slot held for 5 minutes! Complete your booking below.");
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error(title, { description: detail });
      await availability.reload();
    }
  }

  async function handleReleaseSlot() {
    if (!selected) return;
    const currentId = selected;
    setSelected(null);
    setHoldExpiresAt(null);
    try {
      await hospitalsApi.releaseSlot(id, currentId);
    } catch {

    } finally {
      await availability.reload();
    }
  }

  if (hospital.status === "loading") {
    return (
      <div className="space-y-6">
        {back}
        <LoadingState label="Loading hospital" rows={4} />
      </div>
    );
  }
  if (hospital.status === "error") {
    return (
      <div className="space-y-6">
        {back}
        {isApiError(hospital.error) && hospital.error.isNotFound ? (
          <EmptyState title="Hospital not found" description="It may have been removed, or it isn’t available to you." />
        ) : (
          <ErrorState error={hospital.error} onRetry={hospital.reload} />
        )}
      </div>
    );
  }

  const h = hospital.data;
  const slots = availability.status === "ready" ? availability.data : [];
  const chosen = slots.find((s) => s.id === selected) ?? null;

  async function book() {
    if (!chosen) return;
    setPending(true);
    setNotice(null);
    try {

      const appointment = await appointmentsApi.book({ hospitalId: id, slotId: chosen.id });
      router.push(`/appointments?booked=${encodeURIComponent(appointment.id)}`);
    } catch (error) {
      if (isApiError(error) && (error.status === 409 || error.status === 422)) {
        setNotice({ tone: "warning", title: "That time isn’t available", body: `${error.message} The list below has been refreshed.` });
        setSelected(null);
        availability.reload();
      } else {
        const { title, detail } = describeError(error);
        setNotice({ tone: "danger", title: "Your appointment wasn’t booked", body: `${title}. ${detail}` });
      }
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      {back}
      <PageHeader title={h.name} description={h.city ?? undefined} />
      <div className="-mt-4 flex flex-wrap items-center gap-2">
        {h.isDemo ? <DemoTag /> : null}
        {h.ratingAverage ? (
          <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Star className="size-3.5 fill-amber-400 text-amber-500" />
            <span>{h.ratingAverage.toFixed(1)}</span>
            <span className="text-muted-foreground font-normal">({h.reviewCount ?? 0})</span>
          </div>
        ) : null}
        {!(h.active ?? h.isActive ?? true) ? <Badge tone="warning">Not accepting appointments</Badge> : null}
      </div>

      <dl className="bg-card divide-y rounded-md border px-5 text-sm">
        <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Address</dt>
          <dd className="space-y-1.5">
            <p>{h.address ?? "Not provided"}</p>
            {h.locationUrl ? (
              <a
                href={h.locationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-info inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-4 hover:opacity-80"
              >
                <MapPin className="size-3.5" /> Open in Google Maps
                <ExternalLink className="size-3" />
              </a>
            ) : null}
          </dd>
        </div>
        {h.timings ? (
          <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">Timings</dt>
            <dd className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5 text-muted-foreground" />
              <span>{h.timings}</span>
            </dd>
          </div>
        ) : null}
        <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Phone</dt>
          <dd>
            {h.phone ? (
              <a href={`tel:${h.phone.replace(/\s+/g, "")}`} className="text-info underline underline-offset-4">
                {h.phone}
              </a>
            ) : (
              "Not provided"
            )}
          </dd>
        </div>
        {h.website ? (
          <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">Website</dt>
            <dd>
              <a
                href={h.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-info inline-flex items-center gap-1.5 underline underline-offset-4 hover:opacity-80"
              >
                <Globe className="size-3.5" />
                {h.website.replace(/^https?:\/\//i, "")}
                <ExternalLink className="size-3" />
              </a>
            </dd>
          </div>
        ) : null}
        <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Specialities</dt>
          <dd>{h.specialties.length ? h.specialties.join(" · ") : "Not provided"}</dd>
        </div>
      </dl>

      <section aria-labelledby="book" className="space-y-5">
        <div className="max-w-prose space-y-1">
          <h2 id="book" className="text-lg">
            Book an appointment
          </h2>
          <p className="text-muted-foreground text-sm">Choose one of the open times. A time can only be booked by one person.</p>
        </div>

        {IS_DEMO ? (
          <Alert tone="demo">
            <Info aria-hidden="true" />
            <AlertTitle>Demo mode</AlertTitle>
            <AlertDescription>Booking saves a sample appointment in this browser only. No hospital receives it.</AlertDescription>
          </Alert>
        ) : null}

        {notice ? (
          <div ref={noticeRef} tabIndex={-1}>
            <Alert tone={notice.tone}>
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>{notice.title}</AlertTitle>
              <AlertDescription>{notice.body}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        {!(h.active ?? h.isActive ?? true) ? (
          <EmptyState icon={CalendarX} title="This hospital isn’t accepting appointments" description="It has been deactivated by a HealthHub administrator. Choose another hospital." action={<Button asChild variant="outline"><Link href="/hospitals">Find a hospital</Link></Button>} />
        ) : availability.status === "loading" ? (
          <LoadingState label="Loading available times" rows={3} />
        ) : availability.status === "error" ? (
          <ErrorState error={availability.error} onRetry={availability.reload} />
        ) : slots.length === 0 ? (
          <EmptyState icon={CalendarX} title="No open times right now" description="Every listed time is taken, or none have been added. Check again later, or try another hospital." action={<Button asChild variant="outline"><Link href="/hospitals">Other hospitals</Link></Button>} />
        ) : (
          <>
            <SlotPicker
              hospitalId={id}
              slots={slots}
              selectedSlotId={selected}
              holdExpiresAt={holdExpiresAt}
              onSelectSlot={handleSelectSlot}
              onReleaseSlot={handleReleaseSlot}
            />

            <div className="bg-card/95 supports-[backdrop-filter]:bg-card/85 sticky bottom-4 z-20 rounded-xl border p-4 shadow-lg backdrop-blur-md" aria-live="polite">
              {chosen ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{h.name}</span>
                      <span className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-semibold">15m Consultation</span>
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {formatDayLong(new Date(chosen.startsAt))} · {formatTime(new Date(chosen.startsAt))} – {formatTime(new Date(chosen.endsAt))}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Consultation fee: <span className="font-semibold text-emerald-600 dark:text-emerald-400">₹500</span> (Payable at clinic or online via Razorpay)
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Button variant="outline" size="sm" onClick={handleReleaseSlot} disabled={pending}>
                      Release slot
                    </Button>
                    <Button onClick={book} disabled={pending} size="default" className="min-w-[140px]">
                      {pending ? (
                        <>
                          <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Confirming…
                        </>
                      ) : (
                        "Confirm Booking"
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-sm">
                  <p className="text-muted-foreground">
                    Select a 15-minute consultation slot above to hold it in real-time.
                  </p>
                  <span className="border-border bg-muted/60 text-muted-foreground rounded-md border px-2.5 py-1 text-xs font-medium">
                    5-min reservation hold
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <section aria-label="Hospital Reviews" className="border-t pt-8">
        <HospitalReviews hospitalId={id} hospitalName={h.name} />
      </section>
    </div>
  );
}
