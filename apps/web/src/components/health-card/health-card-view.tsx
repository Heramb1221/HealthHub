"use client";

import * as React from "react";
import {
  Printer,
  CreditCard,
  Layers,
  Scissors,
  Info,
} from "lucide-react";

import { isNoPatientError, NoPatientProfile } from "@/components/feedback/no-patient";
import { ErrorState } from "@/components/feedback/states";
import { AccessExplainer } from "@/components/health-card/access-explainer";
import {
  CardFront,
  CardBack,
  InteractiveFlipCard,
  PrintableCardSheet,
} from "@/components/health-card/card-face";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { healthCardApi } from "@/lib/api/health-card";
import { useResource } from "@/lib/use-resource";

export function HealthCardView() {
  const card = useResource(() => healthCardApi.get(), "card");
  const [viewMode, setViewMode] = React.useState<"interactive" | "both" | "print-sheet">("interactive");

  return (
    <div className="space-y-8">
      {/* Page Header (hidden in print) */}
      <div className="print:hidden">
        <PageHeader
          title="Sehat Med Digital Card"
          description="Your official digital health card modeled after standard CR80 wallet cards (85.6mm × 54.0mm). Printable with wallet cutting guidelines and center fold line."
          actions={
            card.status === "ready" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="default"
                  onClick={() => window.print()}
                  className="bg-[#0e3a6c] hover:bg-[#0b2d54] text-white font-semibold"
                >
                  <Printer aria-hidden="true" className="size-4" /> Print Card
                </Button>
              </div>
            ) : null
          }
        />
      </div>

      {card.status === "loading" ? (
        <div role="status" className="max-w-2xl space-y-4">
          <span className="sr-only">Loading your health card…</span>
          <Skeleton className="h-72 w-full max-w-[460px] rounded-xl" />
        </div>
      ) : card.status === "error" ? (
        isNoPatientError(card.error) ? (
          <NoPatientProfile />
        ) : (
          <ErrorState error={card.error} onRetry={card.reload} />
        )
      ) : (
        <>
          {/* SCREEN CONTROLS & DISPLAY (HIDDEN WHEN PRINTING) */}
          <div className="space-y-6 print:hidden">
            {/* View switcher tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("interactive")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                    viewMode === "interactive"
                      ? "bg-white text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <CreditCard className="size-3.5" />
                  <span>3D Flip Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("both")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                    viewMode === "both"
                      ? "bg-white text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Layers className="size-3.5" />
                  <span>Both Sides</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("print-sheet")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                    viewMode === "print-sheet"
                      ? "bg-white text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Scissors className="size-3.5" />
                  <span>Print Sheet (Wallet Size)</span>
                </button>
              </div>

              {/* Dimension tag */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span>CR80 Wallet Standard (85.6mm × 54.0mm)</span>
              </div>
            </div>

            {/* Selected View Mode Content */}
            {viewMode === "interactive" && (
              <div className="flex flex-col items-center justify-center py-4">
                <InteractiveFlipCard card={card.data} />
              </div>
            )}

            {viewMode === "both" && (
              <div className="grid gap-6 md:grid-cols-2 max-w-4xl py-2">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Front Side / सम्मुख भाग
                  </p>
                  <CardFront card={card.data} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Back Side (Emergency QR) / पृष्ठ भाग
                  </p>
                  <CardBack card={card.data} />
                </div>
              </div>
            )}

            {viewMode === "print-sheet" && (
              <PrintableCardSheet card={card.data} />
            )}

            {/* QR Code details accordion */}
            <details className="max-w-2xl rounded-md border border-border bg-card p-4 text-sm">
              <summary className="cursor-pointer font-medium text-foreground hover:text-primary flex items-center gap-2">
                <Info className="size-4 text-info" />
                <span>Verify what the Emergency QR code points to</span>
              </summary>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <p>
                  The back of your card contains an instant emergency triage verification link. In clinical triage, first responders or hospital doctors scan it to verify critical life-saving flags (Blood Group & Allergies) under authenticated consent protocols.
                </p>
                <code className="block rounded bg-muted p-2 font-mono text-[11px] break-all select-all text-foreground">
                  {card.data.qr?.url ?? (typeof window !== "undefined" ? `${window.location.origin}/qr/${card.data.healthId}` : card.data.healthId)}
                </code>
              </div>
            </details>
          </div>

          {/* DEDICATED PRINT CONTAINER (SHOWN ONLY DURING BROWSER PRINT) */}
          <div className="hidden print:block print:w-full">
            <PrintableCardSheet card={card.data} />
          </div>

          {/* Explainer guide (hidden when printing) */}
          <AccessExplainer />
        </>
      )}
    </div>
  );
}
