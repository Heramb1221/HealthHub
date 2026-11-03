import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="bg-hero flex min-h-dvh items-center justify-center px-4 py-16">
      <section aria-labelledby="not-found-title" className="surface w-full max-w-md space-y-5 p-8 text-center">
        <span className="bg-accent text-accent-foreground mx-auto inline-flex size-12 items-center justify-center rounded-xl">
          <Compass aria-hidden="true" className="size-6" />
        </span>
        <div className="space-y-2">
          <p className="text-primary text-sm font-semibold">Error 404</p>
          <h1 id="not-found-title" className="text-2xl font-bold tracking-tight">
            Page not found
          </h1>
          <p className="text-muted-foreground text-sm">This page does not exist or has moved.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/">Go to home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
