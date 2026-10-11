"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface TextareaFieldProps extends Omit<React.ComponentProps<"textarea">, "id" | "name"> {
  name: string;
  label: string;
  hint?: string;
  error?: string;
}

export function TextareaField({ name, label, hint, error, className, ...props }: TextareaFieldProps) {
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
      <Textarea id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props} />
      {error ? (
        <p id={errorId} className="text-destructive text-sm font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}
