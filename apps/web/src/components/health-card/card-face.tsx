import Link from "next/link";
import { HeartPulse } from "lucide-react";

import { QrCode } from "@/components/health-card/qr-code";
import { HealthId } from "@/components/profile/health-id";
import { DemoTag } from "@/components/status/demo-tag";
import type { HealthCard } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

/** The card itself. Deliberately shows only a name, the HealthHub ID and the QR: nothing else about the person. */
export function CardFace({ card }: { card: HealthCard }) {
  return (
    <section
      aria-label="Your digital health card"
      className="bg-card border-l-primary max-w-2xl rounded-lg border border-l-4 p-6 shadow-xs print:shadow-none"
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-5">
          <p className="text-primary flex items-center gap-2 text-sm font-semibold">
            <HeartPulse aria-hidden="true" className="text-accent-foreground size-5" />
            HealthHub · Digital health card
          </p>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Name</p>
            {card.fullName ? (
              <p className="text-2xl font-semibold break-words">{card.fullName}</p>
            ) : (
              <p className="text-sm">
                No name on your profile yet.{" "}
                <Link href="/profile" className="text-info font-medium underline underline-offset-4 print:hidden">
                  Add it in your profile
                </Link>
              </p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">HealthHub ID</p>
            <HealthId value={card.healthId} />
          </div>
          <p className="text-muted-foreground text-xs">Issued {formatDate(card.issuedAt)}</p>
          {card.isDemo ? (
            <p className="flex flex-wrap items-center gap-2 text-xs">
              <DemoTag /> Not valid for any real service.
            </p>
          ) : null}
        </div>

        <figure className="shrink-0 space-y-2 sm:w-48">
          <QrCode
            value={card.qr.url}
            label="QR code for your HealthHub card. It contains a random reference only, not medical information."
            className="border-border size-44 rounded-md border"
          />
          <figcaption className="text-muted-foreground text-xs">Opens a protected HealthHub page. The code holds a random reference, nothing else.</figcaption>
        </figure>
      </div>
    </section>
  );
}
