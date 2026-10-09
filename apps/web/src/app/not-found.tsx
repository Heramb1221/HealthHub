import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-2xl">Page not found</h1>
      <p className="text-muted-foreground mt-2 max-w-prose">This page does not exist or has moved.</p>
      <Button asChild className="mt-6">
        <Link href="/">Go to home</Link>
      </Button>
    </main>
  );
}
