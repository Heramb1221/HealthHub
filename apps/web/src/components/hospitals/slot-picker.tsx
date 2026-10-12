"use client";

import type { AvailabilitySlot } from "@/lib/api/types";
import { formatDayLong, formatTime } from "@/lib/format";

function localDayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Open times grouped by day. Every slot is a radio button (one choice across all days) styled as a pill,
 * so it works with a keyboard and a screen reader: arrow keys move between times, the legend names the day.
 */
export function SlotPicker({ slots, value, onChange }: { slots: AvailabilitySlot[]; value: string | null; onChange: (id: string) => void }) {
  const days: { key: string; date: Date; slots: AvailabilitySlot[] }[] = [];
  for (const slot of slots) {
    const key = localDayKey(slot.startsAt);
    const last = days[days.length - 1];
    if (last?.key === key) last.slots.push(slot);
    else days.push({ key, date: new Date(slot.startsAt), slots: [slot] });
  }

  return (
    <div className="space-y-5">
      {days.map((day) => (
        <fieldset key={day.key} className="space-y-2">
          <legend className="text-sm font-medium">{formatDayLong(day.date)}</legend>
          <div className="flex flex-wrap gap-2">
            {day.slots.map((slot) => {
              const start = new Date(slot.startsAt);
              const end = new Date(slot.endsAt);
              return (
                <label
                  key={slot.id}
                  className="border-input bg-card hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-ring cursor-pointer rounded-md border px-3 py-2 text-sm tabular-nums has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2"
                >
                  <input
                    type="radio"
                    name="slot"
                    value={slot.id}
                    checked={value === slot.id}
                    onChange={() => onChange(slot.id)}
                    className="sr-only"
                    aria-label={`${formatDayLong(start)}, ${formatTime(start)} to ${formatTime(end)}`}
                  />
                  {formatTime(start)}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
