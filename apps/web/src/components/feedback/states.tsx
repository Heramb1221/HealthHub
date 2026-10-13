import type { LucideIcon } from "lucide-react";
import { Inbox, RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { describeError } from "@/lib/api/errors";

/** Loading placeholder. `label` is announced to screen readers; the skeleton rows themselves are hidden. */
export function LoadingState({ label = "Loading", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** Empty state: says what's missing and offers the next action. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-border bg-card flex flex-col items-start gap-3 rounded-md border border-dashed px-6 py-8">
      <Icon aria-hidden="true" className="text-muted-foreground size-6" />
      <div className="max-w-prose space-y-1">
        <h2 className="text-base">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** Error state with retry. Shows the server request ID when present so support can trace it. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { title, detail, requestId } = describeError(error);
  return (
    <div role="alert" className="border-destructive/30 bg-danger-surface flex flex-col items-start gap-3 rounded-md border px-6 py-6">
      <TriangleAlert aria-hidden="true" className="text-destructive size-6" />
      <div className="max-w-prose space-y-1">
        <h2 className="text-base">{title}</h2>
        <p className="text-sm">{detail}</p>
        {requestId ? <p className="text-muted-foreground text-xs">Reference: {requestId}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      ) : null}
    </div>
  );
}
