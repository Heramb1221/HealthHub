"use client";

import { Printer } from "lucide-react";

import { isNoPatientError, NoPatientProfile } from "@/components/feedback/no-patient";
import { ErrorState } from "@/components/feedback/states";
import { AccessExplainer } from "@/components/health-card/access-explainer";
import { CardFace } from "@/components/health-card/card-face";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { healthCardApi } from "@/lib/api/health-card";
import { useResource } from "@/lib/use-resource";

export function HealthCardView() {
  const card = useResource(() => healthCardApi.get(), "card");

  return (
    <div className="space-y-10">
      <PageHeader
        title="Digital health card"
        description="Your HealthHub ID and a QR code. The code holds a random reference, never your medical details."
        actions={
          card.status === "ready" ? (
            <Button variant="outline" onClick={() => window.print()} className="print:hidden">
              <Printer aria-hidden="true" /> Print card
            </Button>
          ) : null
        }
      />

      {card.status === "loading" ? (
        <div role="status" className="max-w-2xl">
          <span className="sr-only">Loading your health card…</span>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : card.status === "error" ? (
        isNoPatientError(card.error) ? <NoPatientProfile /> : <ErrorState error={card.error} onRetry={card.reload} />
      ) : (
        <>
          <div className="space-y-3">
            <CardFace card={card.data} />
            <details className="max-w-2xl text-sm print:hidden">
              <summary className="text-info cursor-pointer font-medium underline-offset-4 hover:underline">See exactly what the QR code contains</summary>
              <p className="text-muted-foreground mt-2">The code is this address, and only this:</p>
              <code className="bg-muted mt-1 block rounded-sm px-2 py-1.5 font-mono text-xs break-all select-all">{card.data.qr.url}</code>
            </details>
          </div>
          <AccessExplainer />
        </>
      )}
    </div>
  );
}
