"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, LoaderCircle, PowerOff } from "lucide-react";
import { toast } from "sonner";

import { HospitalForm } from "@/components/admin/hospital-form";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { DemoTag } from "@/components/status/demo-tag";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminHospitalsApi } from "@/lib/api/admin-hospitals";
import { describeError, isApiError } from "@/lib/api/errors";
import { hospitalsApi } from "@/lib/api/hospitals";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useResource } from "@/lib/use-resource";

export function AdminHospitalEdit({ id }: { id: string }) {
  const hospital = useResource(() => hospitalsApi.get(id), id);
  useDocumentTitle(hospital.status === "ready" ? `${hospital.data.name} · Admin` : null);
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const back = (
    <Link href="/admin/hospitals" className="text-info inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" /> All hospitals
    </Link>
  );

  if (hospital.status === "loading") {
    return (
      <div className="space-y-6">
        {back}
        <LoadingState label="Loading hospital" rows={4} />
      </div>
    );
  }
  if (hospital.status === "error") {
    return (
      <div className="space-y-6">
        {back}
        {isApiError(hospital.error) && hospital.error.isNotFound ? (
          <EmptyState title="Hospital not found" description="It may have been removed." />
        ) : (
          <ErrorState error={hospital.error} onRetry={hospital.reload} />
        )}
      </div>
    );
  }

  const h = hospital.data;

  async function deactivate() {
    setPending(true);
    try {
      const updated = await adminHospitalsApi.deactivate(id);
      hospital.setData(updated);
      setConfirming(false);
      toast.success("Hospital deactivated");
    } catch (error) {
      const { title, detail } = describeError(error);
      toast.error("It wasn’t deactivated", { description: `${title}. ${detail}` });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-10">
      <div className="space-y-6">
        {back}
        <PageHeader
          title={h.name}
          description="Edit this hospital’s details."
          actions={
            <Button asChild variant="outline">
              <Link href={`/admin/hospitals/${encodeURIComponent(id)}/slots`}>
                <CalendarClock aria-hidden="true" /> Open times
              </Link>
            </Button>
          }
        />
        <div className="-mt-4 flex flex-wrap items-center gap-2">
          {h.active ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>}
          {h.isDemo ? <DemoTag /> : null}
        </div>
      </div>

      {/* key: after a save the form is rebuilt from the saved values the API returned */}
      <HospitalForm
        key={`${h.name}|${h.city}|${h.address}|${h.phone}|${h.specialties.join(",")}`}
        initial={h}
        submitLabel="Save changes"
        cancelHref="/admin/hospitals"
        onSubmit={async (input) => {
          const updated = await adminHospitalsApi.update(id, input);
          hospital.setData(updated);
          toast.success("Changes saved");
        }}
      />

      <section aria-labelledby="deactivate" className="max-w-2xl space-y-3 border-t pt-8">
        <h2 id="deactivate" className="text-lg">
          Deactivate hospital
        </h2>
        {h.active ? (
          <>
            <p className="text-muted-foreground text-sm">
              Patients will no longer see this hospital or be offered its times. This doesn’t cancel appointments that are already booked. Reactivating isn’t available in this version.
            </p>
            {confirming ? (
              <div className="bg-muted flex flex-col gap-3 rounded-md p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium">Deactivate {h.name}?</p>
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" disabled={pending} onClick={deactivate}>
                    {pending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <PowerOff aria-hidden="true" />} Yes, deactivate
                  </Button>
                  <Button variant="outline" size="sm" autoFocus disabled={pending} onClick={() => setConfirming(false)}>
                    Keep active
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setConfirming(true)}>
                <PowerOff aria-hidden="true" /> Deactivate hospital
              </Button>
            )}
          </>
        ) : (
          <Alert tone="neutral" role="status">
            <PowerOff aria-hidden="true" />
            <AlertTitle>This hospital is deactivated</AlertTitle>
            <AlertDescription>Patients can’t see it or book it. Reactivating isn’t available in this version.</AlertDescription>
          </Alert>
        )}
      </section>
    </div>
  );
}
