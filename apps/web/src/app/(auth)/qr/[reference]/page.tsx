import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Where a scanned HealthHub QR code lands. It is public and shows NO medical or personal information.
 * It does not look up or echo the reference, so valid and invalid codes look identical (nothing to probe).
 * Real access happens through the protected server-side flow (POST /qr/access-sessions), which needs an
 * authorized account and the patient's consent.
 */
export const metadata: Metadata = {
  title: "HealthHub health card",
  robots: { index: false, follow: false },
};

export default function QrLandingPage() {
  return (
    <div className="space-y-6">
      <ShieldCheck aria-hidden="true" className="text-accent-foreground size-8" />
      <div className="space-y-2">
        <h1 className="text-2xl">HealthHub health card</h1>
        <p className="text-muted-foreground">This code doesn’t contain any medical information, and this page doesn’t show any.</p>
      </div>
      <div className="space-y-2 text-sm">
        <p>To see a patient’s record, HealthHub needs an authorized account and the patient’s consent. Without both, nothing is shown.</p>
        <p className="text-muted-foreground">If this is your own card, sign in to see it.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/sign-in">Sign in</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">About HealthHub</Link>
        </Button>
      </div>
    </div>
  );
}
