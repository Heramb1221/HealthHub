"use client";

import { ErrorState } from "@/components/feedback/states";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-16">
      <ErrorState error={error} onRetry={reset} />
    </main>
  );
}
