"use client";

import * as React from "react";
import { Check, Clock, Flame, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AvailabilitySlot } from "@/lib/api/types";
import { formatTime } from "@/lib/format";

interface SlotPickerProps {
  hospitalId: string;
  slots: AvailabilitySlot[];
  selectedSlotId: string | null;
  holdExpiresAt?: string | null;
  onSelectSlot: (slot: AvailabilitySlot) => Promise<void>;
  onReleaseSlot: () => Promise<void>;
}

function localDayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getSessionPeriod(date: Date): "morning" | "afternoon" | "evening" {

  const hours = date.getHours();
  if (hours < 13) return "morning";
  if (hours < 17) return "afternoon";
  return "evening";
}

export function SlotPicker({
  slots,
  selectedSlotId,
  holdExpiresAt,
  onSelectSlot,
  onReleaseSlot,
}: SlotPickerProps) {

  const daysMap = React.useMemo(() => {
    const map = new Map<string, { date: Date; slots: AvailabilitySlot[] }>();
    for (const slot of slots) {
      const key = localDayKey(slot.startsAt);
      const existing = map.get(key);
      if (existing) {
        existing.slots.push(slot);
      } else {
        map.set(key, { date: new Date(slot.startsAt), slots: [slot] });
      }
    }
    return map;
  }, [slots]);

  const daysList = React.useMemo(() => Array.from(daysMap.entries()), [daysMap]);

  const [chosenDayKey, setChosenDayKey] = React.useState<string>("");
  const activeDayKey = React.useMemo(() => {
    if (chosenDayKey && daysMap.has(chosenDayKey)) return chosenDayKey;
    return daysList[0]?.[0] ?? "";
  }, [chosenDayKey, daysMap, daysList]);

  const currentDaySlots = React.useMemo(() => {
    return daysMap.get(activeDayKey)?.slots ?? [];
  }, [daysMap, activeDayKey]);

  const { morning, afternoon, evening } = React.useMemo(() => {
    const m: AvailabilitySlot[] = [];
    const a: AvailabilitySlot[] = [];
    const e: AvailabilitySlot[] = [];
    for (const slot of currentDaySlots) {
      const period = getSessionPeriod(new Date(slot.startsAt));
      if (period === "morning") m.push(slot);
      else if (period === "afternoon") a.push(slot);
      else e.push(slot);
    }
    return { morning: m, afternoon: a, evening: e };
  }, [currentDaySlots]);

  const [secondsRemaining, setSecondsRemaining] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!holdExpiresAt || !selectedSlotId) {
      return;
    }

    const targetTime = new Date(holdExpiresAt).getTime();
    const computeDiff = () => Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));

    const timer = setInterval(() => {
      const diff = computeDiff();
      setSecondsRemaining(diff);
      if (diff <= 0) {
        clearInterval(timer);
        void onReleaseSlot();
      }
    }, 1000);

    const initial = setTimeout(() => {
      setSecondsRemaining(computeDiff());
    }, 0);

    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [holdExpiresAt, selectedSlotId, onReleaseSlot]);

  const activeHoldSeconds = holdExpiresAt && selectedSlotId ? secondsRemaining : null;

  function formatCountdown(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="space-y-6">

      <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-xs shadow-sm">
        <div className="text-muted-foreground flex items-center gap-2 font-medium">
          <Clock className="text-primary size-4" />
          <span>Real-Time Consultation Slot Grid</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="border-emerald-500/40 bg-emerald-500/10 size-3 rounded-sm border" />
            <span className="text-muted-foreground">Available (15m)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="border-primary bg-primary size-3 rounded-sm border" />
            <span className="font-semibold text-slate-800 dark:text-slate-200">Selected / Held</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="border-amber-500/40 bg-amber-500/20 size-3 animate-pulse rounded-sm border" />
            <span className="text-muted-foreground">In Checkout (Locked)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="bg-muted size-3 rounded-sm border opacity-50" />
            <span className="text-muted-foreground line-through">Booked</span>
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="scrollbar-none flex gap-2.5 overflow-x-auto pb-2 pt-1">
          {daysList.map(([key, data]) => {
            const isSelected = key === activeDayKey;
            const openCount = data.slots.filter((s) => s.status !== "booked" && s.status !== "holding").length;
            const isFastFilling = openCount > 0 && openCount <= 8;

            const dayName = data.date.toLocaleDateString("en-IN", { weekday: "short" });
            const dayNum = data.date.toLocaleDateString("en-IN", { day: "numeric" });
            const monthName = data.date.toLocaleDateString("en-IN", { month: "short" });

            return (
              <button
                key={key}
                type="button"
                onClick={() => setChosenDayKey(key)}
                className={`relative flex min-w-[5.25rem] flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20"
                    : "border-border/70 bg-card hover:bg-muted/70 text-foreground"
                }`}
              >
                <span className={`text-[11px] font-semibold uppercase tracking-wider ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  {dayName}
                </span>
                <span className="my-0.5 text-lg font-bold leading-none">{dayNum}</span>
                <span className={`text-[11px] font-medium ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  {monthName}
                </span>

                <div className="mt-1.5 flex items-center justify-center">
                  {openCount === 0 ? (
                    <span className="text-[10px] font-medium text-rose-500">Full</span>
                  ) : isFastFilling ? (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-500">
                      <Flame className="size-2.5" /> Fast
                    </span>
                  ) : (
                    <span className={`text-[10px] font-medium ${isSelected ? "text-emerald-200" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {openCount} slots
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedSlotId && activeHoldSeconds !== null ? (
        <div className="border-amber-500/30 bg-amber-500/10 flex items-center justify-between rounded-lg border p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="bg-amber-400 absolute inline-flex size-full animate-ping rounded-full opacity-75" />
              <span className="bg-amber-500 relative inline-flex size-2.5 rounded-full" />
            </span>
            <span className="font-medium text-amber-900 dark:text-amber-200">
              Slot reserved for you: <span className="font-mono font-bold">{formatCountdown(activeHoldSeconds)}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => void onReleaseSlot()}
            className="text-xs font-semibold text-amber-800 underline underline-offset-4 hover:opacity-80 dark:text-amber-300"
          >
            Release hold
          </button>
        </div>
      ) : null}

      <div className="relative py-2 text-center">
        <div className="border-primary/20 bg-gradient-to-b from-primary/10 to-transparent mx-auto h-2 w-3/4 rounded-t-full border-t-2" />
        <p className="text-muted-foreground -mt-1 text-[11px] font-semibold uppercase tracking-widest">
          OPD Consultation Wing · Doctor Consultation Cabins
        </p>
      </div>

      <div className="space-y-6">

        {morning.length > 0 ? (
          <SessionBlock
            title="Morning OPD Session"
            timeRange="09:00 AM – 01:00 PM"
            slots={morning}
            selectedSlotId={selectedSlotId}
            onSelectSlot={onSelectSlot}
          />
        ) : null}

        {afternoon.length > 0 ? (
          <SessionBlock
            title="Afternoon OPD Session"
            timeRange="02:00 PM – 05:00 PM"
            slots={afternoon}
            selectedSlotId={selectedSlotId}
            onSelectSlot={onSelectSlot}
          />
        ) : null}

        {evening.length > 0 ? (
          <SessionBlock
            title="Evening Clinic Session"
            timeRange="05:30 PM – 08:30 PM"
            slots={evening}
            selectedSlotId={selectedSlotId}
            onSelectSlot={onSelectSlot}
          />
        ) : null}

        {currentDaySlots.length === 0 ? (
          <div className="bg-muted/40 rounded-lg border border-dashed p-8 text-center">
            <Clock className="text-muted-foreground mx-auto size-8" />
            <p className="mt-2 text-sm font-medium">No slots scheduled for this date</p>
            <p className="text-muted-foreground text-xs">Please choose another date from the calendar bar above.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface SessionBlockProps {
  title: string;
  timeRange: string;
  slots: AvailabilitySlot[];
  selectedSlotId: string | null;
  onSelectSlot: (slot: AvailabilitySlot) => Promise<void>;
}

function SessionBlock({ title, timeRange, slots, selectedSlotId, onSelectSlot }: SessionBlockProps) {
  const openCount = slots.filter((s) => s.status !== "booked" && s.status !== "holding").length;

  return (
    <div className="bg-card rounded-xl border p-4 shadow-xs">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <span className="text-muted-foreground text-xs">({timeRange})</span>
        </div>
        <div className="flex items-center gap-1.5">
          {openCount === 0 ? (
            <Badge tone="danger">Session Full</Badge>
          ) : openCount <= 3 ? (
            <Badge tone="warning">
              <Flame className="mr-1 size-3" /> {openCount} slots left
            </Badge>
          ) : (
            <Badge tone="success">{openCount} available</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {slots.map((slot) => {
          const start = new Date(slot.startsAt);
          const end = new Date(slot.endsAt);
          const isSelected = selectedSlotId === slot.id;
          const isBooked = slot.status === "booked";
          const isHoldingByOther = slot.status === "holding";
          const isHeldByMe = slot.status === "held_by_me" || isSelected;

          const timeLabel = formatTime(start);
          const timeAria = `${timeLabel} to ${formatTime(end)}`;

          if (isBooked) {
            return (
              <button
                key={slot.id}
                type="button"
                disabled
                className="bg-muted/60 text-muted-foreground/60 border-border/40 relative flex cursor-not-allowed flex-col items-center justify-center rounded-lg border py-2 text-xs opacity-60"
                title="Booked by another patient"
              >
                <span className="line-through">{timeLabel}</span>
                <span className="text-[9px] font-medium tracking-tight">Booked</span>
              </button>
            );
          }

          if (isHoldingByOther && !isSelected) {
            return (
              <button
                key={slot.id}
                type="button"
                disabled
                className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 relative flex cursor-not-allowed flex-col items-center justify-center rounded-lg border py-2 text-xs opacity-75"
                title="Currently in checkout by another patient"
              >
                <div className="flex items-center gap-1">
                  <Lock className="size-2.5" />
                  <span>{timeLabel}</span>
                </div>
                <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400">Locked</span>
              </button>
            );
          }

          if (isHeldByMe) {
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => void onSelectSlot(slot)}
                className="border-primary bg-primary text-primary-foreground relative flex flex-col items-center justify-center rounded-lg border py-2 text-xs font-semibold shadow-sm ring-2 ring-primary/30 transition-transform active:scale-95"
                aria-label={`Selected: ${timeAria}`}
              >
                <div className="flex items-center gap-1">
                  <Check className="size-3" />
                  <span>{timeLabel}</span>
                </div>
                <span className="text-[9px] font-medium text-primary-foreground/90">Held (15m)</span>
              </button>
            );
          }

          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => void onSelectSlot(slot)}
              className="border-emerald-600/30 bg-card hover:border-emerald-600 hover:bg-emerald-500/10 text-foreground relative flex flex-col items-center justify-center rounded-lg border py-2 text-xs font-medium transition-all hover:scale-[1.02] active:scale-95"
              aria-label={`Available slot: ${timeAria}`}
            >
              <span>{timeLabel}</span>
              <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">15 mins</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
