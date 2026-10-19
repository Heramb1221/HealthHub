"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck, CalendarDays, CircleCheck, Clock, LoaderCircle, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { isNoPatientError, NoPatientProfile } from "@/components/feedback/no-patient";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { SlotPicker } from "@/components/hospitals/slot-picker";
import { PageHeader } from "@/components/layout/page-header";
import { DemoTag } from "@/components/status/demo-tag";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { appointmentsApi } from "@/lib/api/appointments";
import { describeError } from "@/lib/api/errors";
import { hospitalsApi } from "@/lib/api/hospitals";
import type { Appointment, AvailabilitySlot } from "@/lib/api/types";
import { formatDayLong, formatTime } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { buildWhatsAppAppointmentUrl } from "@/lib/whatsapp";


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

function Row({
  a,
  cancellable = false,
  confirming = false,
  pending = false,
  onAskCancel,
  onKeep,
  onConfirm,
}: {
  a: Appointment;
  cancellable?: boolean;
  confirming?: boolean;
  pending?: boolean;
  onAskCancel?: () => void;
  onKeep?: () => void;
  onConfirm?: () => void;
}) {
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
        <div className="flex flex-wrap items-center gap-2">
          {a.status === "booked" ? (
            <Button asChild size="sm" variant="ghost" className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50">
              <a
                href={buildWhatsAppAppointmentUrl({
                  hospitalName: a.hospitalName,
                  dateStr: whenText(a),
                })}
                target="_blank"
                rel="noopener noreferrer"
                title="Share appointment details via WhatsApp"
              >
                <MessageCircle className="size-3.5 text-emerald-600" aria-hidden="true" />
                <span className="hidden sm:inline">WhatsApp</span>
              </a>
            </Button>
          ) : null}
          {a.status === "booked" ? (
            <Button asChild size="sm" variant="default">
              <Link href="/payments">Pay fee</Link>
            </Button>
          ) : null}
          {cancellable && !confirming ? (
            <Button variant="outline" size="sm" onClick={onAskCancel} aria-label={`Cancel appointment at ${a.hospitalName}, ${whenText(a)}`}>
              Cancel appointment
            </Button>
          ) : null}
        </div>

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
  const hospitalsRes = useResource(() => hospitalsApi.list(), "hospitals");

  const [activeTab, setActiveTab] = React.useState<"book" | "my">(() => (justBookedId ? "my" : "book"));
  const [selectedHospitalId, setSelectedHospitalId] = React.useState<string | null>(null);

  const hospitalsList = hospitalsRes.status === "ready" ? hospitalsRes.data : [];
  const activeHospitalId = selectedHospitalId || (hospitalsList.length > 0 ? hospitalsList[0].id : null);

  // Load availability slots for selected hospital
  const slotsRes = useResource(
    () => (activeHospitalId ? hospitalsApi.availability(activeHospitalId) : Promise.resolve([])),
    `slots:${activeHospitalId}`,
  );

  // Real-time polling every 4 seconds when looking at slots
  React.useEffect(() => {
    if (activeTab !== "book" || !activeHospitalId) return;
    const interval = setInterval(() => {
      void slotsRes.reload();
    }, 4000);
    return () => clearInterval(interval);
  }, [activeTab, activeHospitalId, slotsRes]);

  const [selectedSlotId, setSelectedSlotId] = React.useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = React.useState<string | null>(null);
  const [bookingPending, setBookingPending] = React.useState(false);

  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [cancelPending, setCancelPending] = React.useState(false);

  const selectedHospital = hospitalsList.find((h) => h.id === activeHospitalId) ?? null;
  const slots = slotsRes.status === "ready" ? slotsRes.data : [];
  const chosenSlot = slots.find((s) => s.id === selectedSlotId) ?? null;

  async function handleSelectSlot(slot: AvailabilitySlot) {
    if (!activeHospitalId) return;
    if (selectedSlotId === slot.id) return;
    try {
      const res = await hospitalsApi.holdSlot(activeHospitalId, slot.id);
      setSelectedSlotId(slot.id);
      setHoldExpiresAt(res.expiresAt);
      toast.success("15-minute slot held for 5 minutes! Complete your booking below.");
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error(title, { description: detail });
      await slotsRes.reload();
    }
  }

  async function handleReleaseSlot() {
    if (!activeHospitalId || !selectedSlotId) return;
    const currentId = selectedSlotId;
    setSelectedSlotId(null);
    setHoldExpiresAt(null);
    try {
      await hospitalsApi.releaseSlot(activeHospitalId, currentId);
    } catch {
      // Ignore
    } finally {
      await slotsRes.reload();
    }
  }

  async function handleBook() {
    if (!activeHospitalId || !chosenSlot) return;
    setBookingPending(true);
    try {
      await appointmentsApi.book({ hospitalId: activeHospitalId, slotId: chosenSlot.id });
      toast.success("Appointment booked successfully!");
      setSelectedSlotId(null);
      setHoldExpiresAt(null);
      await appointments.reload();
      setActiveTab("my");
    } catch (error) {
      const { title, detail } = describeError(error);
      toast.error("Failed to book appointment", { description: `${title}. ${detail}` });
      await slotsRes.reload();
    } finally {
      setBookingPending(false);
    }
  }

  async function cancel(id: string) {
    setCancelPending(true);
    try {
      const updated = await appointmentsApi.cancel(id);
      if (appointments.status === "ready") {
        appointments.setData(appointments.data.map((a) => (a.id === id ? updated : a)));
      }
      setConfirming(null);
      toast.success("Appointment cancelled");
    } catch (error) {
      const { title, detail } = describeError(error);
      toast.error("It wasn’t cancelled", { description: `${title}. ${detail}` });
    } finally {
      setCancelPending(false);
    }
  }

  const list = appointments.status === "ready" ? appointments.data : [];
  const upcoming = list.filter((a) => a.status === "booked" && new Date(a.startsAt) >= now);
  const earlier = list.filter((a) => !upcoming.includes(a)).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const justBooked = justBookedId ? list.find((a) => a.id === justBookedId && a.status === "booked") : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Appointments"
        description="Book 15-minute consultations with top hospitals in real-time."
      />

      {justBooked ? (
        <Alert tone="success" role="status">
          <CircleCheck aria-hidden="true" />
          <AlertTitle>Appointment booked</AlertTitle>
          <AlertDescription>
            <p>
              {justBooked.hospitalName}, {whenText(justBooked)}.
            </p>
            {justBooked.isDemo ? <p className="mt-1">This is a sample appointment saved in this browser.</p> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Navigation Tabs */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setActiveTab("book")}
          className={`flex items-center gap-2 border-b-2 px-5 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "book"
              ? "border-primary text-primary"
              : "text-muted-foreground hover:text-foreground border-transparent"
          }`}
        >
          <Clock className="size-4" /> Book Appointment (15-Min Slots)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("my")}
          className={`flex items-center gap-2 border-b-2 px-5 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "my"
              ? "border-primary text-primary"
              : "text-muted-foreground hover:text-foreground border-transparent"
          }`}
        >
          <CalendarDays className="size-4" /> My Appointments ({list.length})
        </button>
      </div>

      {activeTab === "book" ? (
        <div className="space-y-6">
          {/* Hospital Selector */}
          <div className="bg-card rounded-xl border p-5 shadow-xs">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Select Hospital</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Choose a medical center to view live 15-minute OPD consultation slots.
            </p>

            {hospitalsRes.status === "loading" ? (
              <LoadingState label="Loading hospitals…" rows={2} />
            ) : hospitalsList.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">No hospitals listed yet.</p>
            ) : (
              <div className="scrollbar-none mt-3.5 flex gap-3 overflow-x-auto pb-1">
                {hospitalsList.map((h) => {
                  const isSelected = h.id === activeHospitalId;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        setSelectedHospitalId(h.id);
                        setSelectedSlotId(null);
                        setHoldExpiresAt(null);
                      }}
                      className={`flex min-w-[15rem] flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border/70 bg-card hover:bg-muted/60"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="font-semibold text-sm line-clamp-1 text-slate-900 dark:text-slate-100">{h.name}</span>
                        {isSelected ? <Badge tone="success">Active</Badge> : null}
                      </div>
                      <span className="text-muted-foreground mt-1 text-xs line-clamp-1">{h.city ?? "Jalgaon"} · {h.specialties[0] ?? "Multispeciality"}</span>
                      {h.timings ? <span className="text-muted-foreground mt-0.5 text-[11px]">🕒 {h.timings}</span> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Real-time 15-Min Movie-Ticket Style Slot Picker */}
          {activeHospitalId ? (
            slotsRes.status === "loading" ? (
              <LoadingState label="Loading 15-minute consultation slots…" rows={4} />
            ) : slotsRes.status === "error" ? (
              <ErrorState error={slotsRes.error} onRetry={slotsRes.reload} />
            ) : slots.length === 0 ? (
              <div className="bg-card rounded-xl border p-8 text-center">
                <Clock className="text-muted-foreground mx-auto size-8" />
                <h3 className="mt-2 text-base font-semibold">No open slots right now</h3>
                <p className="text-muted-foreground text-sm">All times for this hospital are booked. Please check back soon or choose another hospital.</p>
              </div>
            ) : (
              <>
                <SlotPicker
                  hospitalId={activeHospitalId}
                  slots={slots}
                  selectedSlotId={selectedSlotId}
                  holdExpiresAt={holdExpiresAt}
                  onSelectSlot={handleSelectSlot}
                  onReleaseSlot={handleReleaseSlot}
                />

                {/* Floating Bottom Checkout Bar */}
                <div className="bg-card/95 supports-[backdrop-filter]:bg-card/85 sticky bottom-4 z-20 rounded-xl border p-4 shadow-lg backdrop-blur-md" aria-live="polite">
                  {chosenSlot && selectedHospital ? (
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedHospital.name}</span>
                          <span className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-semibold">15m Consultation</span>
                        </div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {formatDayLong(new Date(chosenSlot.startsAt))} · {formatTime(new Date(chosenSlot.startsAt))} – {formatTime(new Date(chosenSlot.endsAt))}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Consultation fee: <span className="font-semibold text-emerald-600 dark:text-emerald-400">₹500</span> (Standard OPD)
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Button variant="outline" size="sm" onClick={handleReleaseSlot} disabled={bookingPending}>
                          Release slot
                        </Button>
                        <Button onClick={handleBook} disabled={bookingPending} size="default" className="min-w-[140px]">
                          {bookingPending ? (
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
            )
          ) : null}
        </div>
      ) : (
        /* My Appointments Tab */
        <div className="space-y-6">
          {appointments.status === "loading" ? (
            <LoadingState label="Loading your appointments" rows={3} />
          ) : appointments.status === "error" ? (
            isNoPatientError(appointments.error) ? <NoPatientProfile /> : <ErrorState error={appointments.error} onRetry={appointments.reload} />
          ) : list.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No booked appointments yet"
              description="Choose a 15-minute slot in the booking tab to confirm an appointment."
              action={<Button onClick={() => setActiveTab("book")}>Book an appointment</Button>}
            />
          ) : (
            <>
              <section aria-labelledby="upcoming" className="space-y-3">
                <h2 id="upcoming" className="text-lg font-semibold">
                  Upcoming Consultations ({upcoming.length})
                </h2>
                {upcoming.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No upcoming appointments.</p>
                ) : (
                  <ul className="bg-card divide-y rounded-md border">
                    {upcoming.map((a) => (
                      <Row
                        key={a.id}
                        a={a}
                        cancellable
                        confirming={confirming === a.id}
                        pending={cancelPending}
                        onAskCancel={() => setConfirming(a.id)}
                        onKeep={() => setConfirming(null)}
                        onConfirm={() => cancel(a.id)}
                      />
                    ))}
                  </ul>
                )}
              </section>

              {earlier.length > 0 ? (
                <section aria-labelledby="earlier" className="space-y-3">
                  <h2 id="earlier" className="text-lg font-semibold">
                    Past and Cancelled
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
      )}
    </div>
  );
}
