"use client";

import { FileText, LoaderCircle, RefreshCw } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api/errors";
import { prescriptionsApi } from "@/lib/api/prescriptions";

type State =
  | { status: "loading" }
  | { status: "error"; title: string; detail: string }
  | { status: "ready"; url: string; mime: string; filename?: string };

/**
 * Shows the patient's original uploaded prescription, exactly as uploaded, beside the digitised record.
 * Images render inline; PDFs get an "Open" link (a real link click, so browsers don't block it the way they
 * block `window.open` called after an await).
 */
export function OriginalDocument({ prescriptionId }: { prescriptionId: string }) {
  const [state, setState] = React.useState<State>({ status: "loading" });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    prescriptionsApi
      .downloadFile(prescriptionId)
      .then(({ blob, filename }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: "ready", url: objectUrl, mime: blob.type, filename });
      })
      .catch((error) => {
        if (cancelled) return;
        const { title, detail } = describeError(error);
        setState({ status: "error", title, detail });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [prescriptionId, attempt]);

  return (
    <section aria-labelledby="original-document-heading" className="bg-card space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="original-document-heading" className="text-base font-semibold">
            Original prescription
          </h2>
          <p className="text-muted-foreground text-xs">Your uploaded file, exactly as you sent it. It is never changed by corrections.</p>
        </div>
        {state.status === "ready" ? (
          <Button asChild variant="outline" size="sm">
            <a href={state.url} target="_blank" rel="noopener noreferrer">
              Open full size
            </a>
          </Button>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <div role="status" className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Loading your original file…
        </div>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="space-y-2 py-4 text-sm">
          <p className="font-medium">{state.title}</p>
          <p className="text-muted-foreground">{state.detail}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => { setState({ status: "loading" }); setAttempt((n) => n + 1); }}>
            <RefreshCw aria-hidden="true" /> Try again
          </Button>
        </div>
      ) : null}

      {state.status === "ready" && state.mime.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={state.url} alt="Your original prescription as uploaded" className="max-h-[70vh] w-full rounded-lg border bg-white object-contain" />
      ) : null}

      {state.status === "ready" && !state.mime.startsWith("image/") ? (
        <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
          <FileText className="size-5" aria-hidden="true" /> This file is a PDF. Use &ldquo;Open full size&rdquo; to view it.
        </div>
      ) : null}
    </section>
  );
}
