import { Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * Family-linked records are a PLANNED workflow (docs/PRODUCT_SPEC.md). The API contract has no family or
 * caregiver endpoints, so this section explains the rule instead of offering controls that would do nothing.
 */
export function FamilyLinks() {
  return (
    <section aria-labelledby="family" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="family" className="text-lg">
          Family-linked records
        </h2>
        <Badge>
          <Users aria-hidden="true" /> Not available yet
        </Badge>
      </div>
      <p className="text-muted-foreground max-w-prose text-sm">
        Linking a family member’s profile to yours will never give anyone access by itself. When this is added, each person will choose what to share,
        with whom, for what purpose and for how long, and can withdraw access at any time.
      </p>
    </section>
  );
}
