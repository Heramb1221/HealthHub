"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarX, Info, LoaderCircle, TriangleAlert } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { SlotPicker } from "@/components/hospitals/slot-picker";
import { DemoTag } from "@/components/status/demo-tag";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { appointmentsApi } from "@/lib/api/appointments";
import { IS_DEMO } from "@/lib/api/config";
import { describeError, isApiError } from "@/lib/api/errors";
import { hospitalsApi } from "@/lib/api/hospitals";
import { formatDayLong, formatTime } from "@/lib/format";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useResource } from "@/lib/use-resource";

export function HospitalDetail({ id }: { id: string }) {
  const router = useRouter();
  const hospital = useResource(() => hospitalsApi.get(id), id);
  const active = hospital.status === "ready" && hospital.data.active;
  const availability = useResource(() => (active ? hospitalsApi.availability(id) : Promise.resolve([])), `${id}:${active}`);

  useDocumentTitle(hospital.status === "ready" ? hospital.data.name : null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: "warning" | "danger"; title: string; body: string } | null>(null);
  const noticeRef = React.useRef<HTMLDivElement>(null);

  const back = (
    <Link href="/hospitals" className="text-info inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" /> All hospitals
    </Link>
  );

  React.useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

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
      // Only when the server has confirmed does the person see a booking at all.
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
        {!h.active ? <Badge tone="warning">Not accepting appointments</Badge> : null}
      </div>

      <dl className="bg-card divide-y rounded-md border px-5 text-sm">
        <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Address</dt>
          <dd>{h.address ?? "Not provided"}</dd>
        </div>
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

        {!h.active ? (
          <EmptyState icon={CalendarX} title="This hospital isn’t accepting appointments" description="It has been deactivated by a HealthHub administrator. Choose another hospital." action={<Button asChild variant="outline"><Link href="/hospitals">Find a hospital</Link></Button>} />
        ) : availability.status === "loading" ? (
          <LoadingState label="Loading available times" rows={3} />
        ) : availability.status === "error" ? (
          <ErrorState error={availability.error} onRetry={availability.reload} />
        ) : slots.length === 0 ? (
          <EmptyState icon={CalendarX} title="No open times right now" description="Every listed time is taken, or none have been added. Check again later, or try another hospital." action={<Button asChild variant="outline"><Link href="/hospitals">Other hospitals</Link></Button>} />
        ) : (
          <>
            <SlotPicker slots={slots} value={selected} onChange={setSelected} />
            <div className="bg-card sticky bottom-4 z-10 max-w-xl space-y-3 rounded-md border p-5 shadow-sm" aria-live="polite">
              {chosen ? (
                <>
                  <h3 className="text-base">Your appointment</h3>
                  <p className="text-sm">
                    <span className="font-medium">{h.name}</span>
                    <br />
                    {formatDayLong(new Date(chosen.startsAt))}, {formatTime(new Date(chosen.startsAt))} to {formatTime(new Date(chosen.endsAt))}
                  </p>
                  <Button onClick={book} disabled={pending}>
                    {pending ? (
                      <>
                        <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Booking
                      </>
                    ) : (
                      "Book this time"
                    )}
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">Choose a time to continue.</p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
