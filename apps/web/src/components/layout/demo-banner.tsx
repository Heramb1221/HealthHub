import { FlaskConical } from "lucide-react";

import { IS_DEMO } from "@/lib/api/config";

/** Persistent banner while the web app runs against the demo adapter instead of the real API. */
export function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div role="region" aria-label="Demo mode" className="bg-demo-surface text-demo border-demo/20 border-b">
      <p className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-2 text-sm sm:items-center">
        <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0 sm:mt-0" />
        <span>
          <strong className="font-semibold">Demo mode.</strong> Records here are synthetic samples stored in this browser only. Nothing is
          sent to a hospital or a real HealthHub account.
        </span>
      </p>
    </div>
  );
}
