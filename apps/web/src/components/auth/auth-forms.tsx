"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { PasswordField, TextField } from "@/components/forms/text-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api/auth";
import { describeError, isApiError } from "@/lib/api/errors";
import { formValues, safeNextPath, validate, type FieldErrors } from "@/lib/forms";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";

/** For sign-in and sign-up the server's own message (wrong password, duplicate email) is the useful one. */
function authErrorMessage(error: unknown): string {
  if (isApiError(error) && error.code !== "NETWORK_ERROR" && error.code !== "INVALID_RESPONSE") return error.message;
  const { title, detail } = describeError(error);
  return `${title}. ${detail}`;
}

function useAuthSubmit<T extends Record<string, string>>(
  schema: Parameters<typeof validate>[0],
  submit: (data: T) => Promise<void>,
  focusFirstError: (form: HTMLFormElement, errors: FieldErrors) => void,
) {
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);
    const result = validate(schema, formValues(form));
    if (!result.ok) {
      setErrors(result.errors);
      focusFirstError(form, result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await submit(result.data as T);
    } catch (error) {
      setFormError(authErrorMessage(error));
      setPending(false);
    }
  }

  return { errors, formError, pending, onSubmit };
}

function focusFirst(form: HTMLFormElement, errors: FieldErrors) {
  const first = Object.keys(errors)[0];
  form.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
}

function FormErrorAlert({ message }: { message: string }) {
  return (
    <Alert tone="danger">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>We couldn’t complete that</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function SubmitButton({ pending, children, pendingLabel }: { pending: boolean; children: React.ReactNode; pendingLabel: string }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const { errors, formError, pending, onSubmit } = useAuthSubmit<{ email: string; password: string }>(
    signInSchema,
    async (data) => {
      const user = await authApi.login(data);
      router.replace(safeNextPath(next) ?? (user.role === "admin" ? "/admin" : "/dashboard"));
    },
    focusFirst,
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {formError ? <FormErrorAlert message={formError} /> : null}
      <TextField name="email" label="Email address" type="email" autoComplete="email" inputMode="email" placeholder="name@example.com" error={errors.email} />
      <PasswordField name="password" label="Password" autoComplete="current-password" error={errors.password} />
      <SubmitButton pending={pending} pendingLabel="Signing in">
        Sign in
      </SubmitButton>
      <p className="text-muted-foreground text-sm">
        New to HealthHub?{" "}
        <Link href={next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up"} className="text-info font-medium underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm({ next }: { next?: string }) {
  const router = useRouter();
  const { errors, formError, pending, onSubmit } = useAuthSubmit<{ fullName: string; email: string; password: string }>(
    signUpSchema,
    async (data) => {
      await authApi.register(data);
      router.replace(safeNextPath(next) ?? "/dashboard");
    },
    focusFirst,
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {formError ? <FormErrorAlert message={formError} /> : null}
      <TextField name="fullName" label="Full name" autoComplete="name" placeholder="As on your ID" error={errors.fullName} />
      <TextField name="email" label="Email address" type="email" autoComplete="email" inputMode="email" placeholder="name@example.com" error={errors.email} />
      <PasswordField name="password" label="Password" hint="Use at least 8 characters." autoComplete="new-password" error={errors.password} />
      <SubmitButton pending={pending} pendingLabel="Creating account">
        Create account
      </SubmitButton>
      <p className="text-muted-foreground text-sm">
        Already have an account?{" "}
        <Link href={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"} className="text-info font-medium underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
