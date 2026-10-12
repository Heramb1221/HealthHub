"use client";

import Link from "next/link";
import { ShieldOff } from "lucide-react";

import { EmptyState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session/session-provider";

/**
 * Courtesy gate for the admin portal: anyone who isn't an administrator sees an explanation instead of
 * screens that would only fail. This is NOT the security boundary. The API checks the role on every admin
 * request (AGENTS.md) and refuses everyone else, whatever this component shows.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  if (user.role !== "admin") {
    return (
      <div className="max-w-2xl">
        <EmptyState
          icon={ShieldOff}
          title="You don’t have access to the admin portal"
          description="This area is for HealthHub administrators. Your account can use the patient screens."
          action={
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to my dashboard</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <>{children}</>;
}
