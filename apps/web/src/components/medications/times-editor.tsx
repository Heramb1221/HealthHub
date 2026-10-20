"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_TIMES = 6;

export function TimesEditor({ times, onChange, error }: { times: string[]; onChange: (times: string[]) => void; error?: string }) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const focusLast = React.useRef(false);
  const addRef = React.useRef<HTMLButtonElement>(null);
  const errorId = React.useId();

  React.useEffect(() => {
    if (focusLast.current) {
      refs.current[times.length - 1]?.focus();
      focusLast.current = false;
    }
  }, [times.length]);

  return (
    <fieldset className="space-y-3" aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-medium">Reminder times</legend>
      <ul className="space-y-2">
        {times.map((time, i) => (
          <li key={i} className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor={`time-${i}`} className="text-muted-foreground text-xs">
                Time {i + 1}
              </Label>
              <Input
                id={`time-${i}`}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="time"
                value={time}
                aria-invalid={error ? true : undefined}
                onChange={(e) => onChange(times.map((t, j) => (j === i ? e.target.value : t)))}
                className="w-36"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={times.length === 1}
              aria-label={`Remove time ${i + 1}`}
              onClick={() => {
                onChange(times.filter((_, j) => j !== i));
                addRef.current?.focus();
              }}
            >
              <Trash2 aria-hidden="true" /> Remove
            </Button>
          </li>
        ))}
      </ul>
      {error ? (
        <p id={errorId} className="text-destructive text-sm font-medium">
          {error}
        </p>
      ) : null}
      <div className="pt-1">
        <p className="text-xs text-muted-foreground mb-1.5 font-medium">Quick presets:</p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "Morning (08:00)", time: "08:00" },
            { label: "Noon (12:00)", time: "12:00" },
            { label: "Afternoon (14:00)", time: "14:00" },
            { label: "Evening (18:00)", time: "18:00" },
            { label: "Night (20:00)", time: "20:00" },
            { label: "Bedtime (22:00)", time: "22:00" },
          ].map((preset) => (
            <button
              key={preset.time}
              type="button"
              className={`rounded-md px-2 py-1 text-xs border transition-colors ${
                times.includes(preset.time)
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => {
                if (times.includes(preset.time)) {
                  if (times.length > 1) {
                    onChange(times.filter((t) => t !== preset.time));
                  }
                } else if (times.length < MAX_TIMES) {
                  onChange([...times, preset.time].sort());
                }
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <Button
        ref={addRef}
        type="button"
        variant="outline"
        size="sm"
        disabled={times.length >= MAX_TIMES}
        onClick={() => {
          focusLast.current = true;
          onChange([...times, ""]);
        }}
      >
        <Plus aria-hidden="true" /> Add custom time
      </Button>
    </fieldset>
  );
}
