import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main id="main" className="mx-auto max-w-5xl space-y-6 px-4 py-12" aria-busy="true">
      <span role="status" aria-live="polite" className="sr-only">
        Loading page
      </span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="h-48 w-full" />
    </main>
  );
}
