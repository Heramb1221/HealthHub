"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface SelectFieldProps extends Omit<React.ComponentProps<"select">, "id" | "name"> {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  options: readonly { value: string; label: string }[];
}

export function SelectField({ name, label, hint, error, placeholder = "Select", options, className, ...props }: SelectFieldProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      <div className="relative">
        <select
          id={id}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="border-input bg-card h-10 w-full appearance-none rounded-md border py-2 pr-10 pl-3 text-base md:text-sm aria-invalid:border-destructive"
          {...props}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-3 right-3 size-4" />
      </div>
      {error ? (
        <p id={errorId} className="text-destructive text-sm font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}
