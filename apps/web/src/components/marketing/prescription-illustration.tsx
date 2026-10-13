import { CheckCircle2, FileSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ProcessingBadge, VerificationBadge } from "@/components/status/verification-badge";
import { LANDING_SAMPLE_MEDICATIONS } from "@/lib/demo/landing-sample";
import { isInstructionSafe, medicationReviewReasons, REVIEW_REASON_LABEL } from "@/lib/prescription-safety";

/** Hero visual: how an uploaded prescription is presented, with unclear details flagged instead of guessed. */
export function PrescriptionIllustration() {
  return (
    <figure className="bg-card rounded-lg border shadow-xs">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <span className="text-sm font-medium">Scanned prescription</span>
        <span className="flex flex-wrap gap-2">
          <ProcessingBadge status="completed" />
          <VerificationBadge status="needs_review" />
        </span>
      </figcaption>
      <ul className="divide-y">
        {LANDING_SAMPLE_MEDICATIONS.map((med) => {
          const safe = isInstructionSafe(med);
          const reasons = medicationReviewReasons(med);
          return (
            <li key={med.name} className="space-y-2 px-4 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">
                  {med.name} <span className="text-muted-foreground font-normal">{med.strength}</span>
                </p>
                {safe ? (
                  <Badge tone="success">
                    <CheckCircle2 aria-hidden="true" /> Read clearly
                  </Badge>
                ) : (
                  <Badge tone="warning">
                    <FileSearch aria-hidden="true" /> Needs review
                  </Badge>
                )}
              </div>
              {safe ? (
                <p className="text-sm">
                  {med.dose}, {med.frequency?.toLowerCase()}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No dose instruction shown. {reasons.map((r, i) => (i === 0 ? REVIEW_REASON_LABEL[r] : REVIEW_REASON_LABEL[r].toLowerCase())).join("; ")}.
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground border-t px-4 py-3 text-xs">Illustration with invented sample values. Not a real prescription.</p>
    </figure>
  );
}
