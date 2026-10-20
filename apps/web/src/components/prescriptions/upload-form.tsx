"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical, Info, LoaderCircle, TriangleAlert } from "lucide-react";

import { TextField } from "@/components/forms/text-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IS_DEMO } from "@/lib/api/config";
import { describeError } from "@/lib/api/errors";
import { prescriptionsApi } from "@/lib/api/prescriptions";
import { ACCEPT_ATTR, checkUploadFile, formatBytes, MAX_UPLOAD_BYTES } from "@/lib/file-sniff";
import { formValues, validate, type FieldErrors } from "@/lib/forms";
import { uploadMetaSchema } from "@/lib/validation/prescription";

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const fileId = React.useId();
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);

    const values = formValues(form);
    const chosen = file;
    const next: FieldErrors = {};
    const fileProblem = await checkUploadFile(chosen);
    if (fileProblem) next.file = fileProblem;
    const meta = validate(uploadMetaSchema, values);
    if (!meta.ok) Object.assign(next, meta.errors);

    if (Object.keys(next).length > 0 || !meta.ok || !chosen) {
      setErrors(next);
      const first = Object.keys(next)[0];
      form.querySelector<HTMLElement>(first === "file" ? `#${CSS.escape(fileId)}` : `[name="${first}"]`)?.focus();
      return;
    }

    setErrors({});
    setPending(true);
    try {
      const result = await prescriptionsApi.upload({ file: chosen, prescriptionDate: meta.data.prescriptionDate, prescriberName: meta.data.prescriberName });
      router.push(`/prescriptions/${encodeURIComponent(result.id)}`);
    } catch (error) {
      const { title, detail } = describeError(error);
      setFormError(`${title}. ${detail}`);
      setPending(false);
    }
  }

  const fileErrorId = `${fileId}-error`;

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl space-y-8">
      {IS_DEMO ? (
        <Alert tone="demo">
          <FlaskConical aria-hidden="true" />
          <AlertTitle>Demo mode: your file is not uploaded or read</AlertTitle>
          <AlertDescription>
            <p>
              The file stays in this browser. After a few seconds the record is filled from a built-in sample so you can try the review steps; it will not match your file. To see the failed state, use a file name that contains
              “unreadable”.
            </p>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert tone="info">
          <Info aria-hidden="true" />
          <AlertTitle>Before you upload</AlertTitle>
          <AlertDescription>
            <p>Only upload prescriptions that belong to you. Your original file is stored privately and kept unchanged. Reading is automatic and can be wrong, so you’ll check the details next.</p>
          </AlertDescription>
        </Alert>
      )}

      {formError ? (
        <Alert tone="danger">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Your file wasn’t uploaded</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={fileId}>Prescription file</Label>
        <p id={`${fileId}-hint`} className="text-muted-foreground text-sm">
          A clear photo or scan. PDF, JPG, PNG or WebP, up to {formatBytes(MAX_UPLOAD_BYTES)}.
        </p>
        <Input
          id={fileId}
          type="file"
          accept={ACCEPT_ATTR}
          aria-invalid={errors.file ? true : undefined}
          aria-describedby={[`${fileId}-hint`, errors.file ? fileErrorId : ""].filter(Boolean).join(" ")}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setErrors((current) => ({ ...current, file: "" }));
          }}
          className="h-auto py-2"
        />
        {file ? (
          <p className="text-sm">
            Selected: <span className="font-medium break-all">{file.name}</span> <span className="text-muted-foreground">({formatBytes(file.size)})</span>
          </p>
        ) : null}
        {errors.file ? (
          <p id={fileErrorId} className="text-destructive text-sm font-medium">
            {errors.file}
          </p>
        ) : null}
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-base font-semibold">Details from the prescription (optional)</legend>
        <TextField name="prescriptionDate" label="Prescription date" type="date" max={today} error={errors.prescriptionDate} />
        <TextField name="prescriberName" label="Prescriber" placeholder="e.g. Dr. A. Sharma" error={errors.prescriberName} />
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Uploading
            </>
          ) : (
            "Upload prescription"
          )}
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/prescriptions">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
