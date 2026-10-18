import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export function FamilyLinks() {
  return (
    <section aria-labelledby="family" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="family" className="text-lg font-medium">
          Family health tree
        </h2>
        <Badge tone="info">
          <Users aria-hidden="true" /> Hereditary records
        </Badge>
      </div>
      <p className="text-muted-foreground max-w-prose text-sm">
        Map your multi-generation family members (grandparents, parents, siblings, children) and hereditary health conditions to help your doctors evaluate familial risk factors. Adding a relative here never gives anyone access to your account or medical records.
      </p>
      <div className="pt-1">
        <Link href="/family" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Open Family Tree <ArrowRight className="ml-1 size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
