import type { Metadata } from "next";
import { Info } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Dashboard" };

/** Slice 2 placeholder so sign-in has a real destination. The real dashboard is slice 3. */
export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="You’re signed in." />
      <Alert tone="info">
        <Info aria-hidden="true" />
        <AlertTitle>Dashboard still being built</AlertTitle>
        <AlertDescription>Your HealthHub ID, reminders, appointments and prescription status will appear here.</AlertDescription>
      </Alert>
    </div>
  );
}
