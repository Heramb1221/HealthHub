"use client";

import { TriangleAlert } from "lucide-react";

import { ErrorState } from "@/components/feedback/states";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="bg-hero flex min-h-dvh items-center justify-center px-4 py-16">
      <section aria-labelledby="global-error-title" className="surface w-full max-w-lg space-y-5 p-8">
        <span className="bg-danger-surface text-destructive inline-flex size-12 items-center justify-center rounded-xl">
          <TriangleAlert aria-hidden="true" className="size-6" />
        </span>
        <h1 id="global-error-title" className="text-2xl font-bold tracking-tight">
          Something went wrong
        </h1>
        <ErrorState error={error} onRetry={reset} />
      </section>
    </main>
  );
}
