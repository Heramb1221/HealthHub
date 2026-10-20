"use client";

import Link from "next/link";
import { ShieldOff } from "lucide-react";

import { EmptyState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session/session-provider";

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
