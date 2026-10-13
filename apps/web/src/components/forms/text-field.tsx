"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface TextFieldProps extends Omit<React.ComponentProps<"input">, "id" | "name"> {
  name: string;
  label: string;
  /** Helpful example or rule shown under the label, e.g. "Use at least 8 characters." */
  hint?: string;
  error?: string;
}

/** Labelled input with hint and error wired up via aria-describedby. Every form field in the app uses this. */
export function TextField({ name, label, hint, error, className, ...props }: TextFieldProps) {
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
      <Input id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props} />
      {error ? (
        <p id={errorId} className="text-destructive text-sm font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Password input with an accessible show/hide toggle. */
export function PasswordField({ name, label, hint, error, className, ...props }: TextFieldProps) {
  const id = React.useId();
  const [visible, setVisible] = React.useState(false);
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
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          className="pr-11"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-0 right-0 size-10"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      {error ? (
        <p id={errorId} className="text-destructive text-sm font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}
