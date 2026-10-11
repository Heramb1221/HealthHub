"use client";

import Link from "next/link";
import { ChevronRight, FileText, Upload } from "lucide-react";

import { isNoPatientError, NoPatientProfile } from "@/components/feedback/no-patient";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { DemoTag } from "@/components/status/demo-tag";
import { ProcessingBadge, VerificationBadge } from "@/components/status/verification-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prescriptionsApi } from "@/lib/api/prescriptions";
import type { Prescription } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { medicationReviewReasons } from "@/lib/prescription-safety";
import { useResource } from "@/lib/use-resource";

function titleOf(rx: Prescription) {
  return rx.prescriptionDate ? formatDate(rx.prescriptionDate) : `Added ${formatDate(rx.createdAt)}`;
}

function medicinesSummary(rx: Prescription) {
  if (rx.processingStatus !== "completed") return { names: "Not read yet", review: 0, count: 0 };
  const review = rx.medications.filter((m) => m.source !== "patient_entered" && medicationReviewReasons(m).length > 0).length;
  return { names: rx.medications.map((m) => m.name ?? "Unnamed").join(", ") || "None found", review, count: rx.medications.length };
}

function UploadButton() {
  return (
    <Button asChild>
      <Link href="/prescriptions/new">
        <Upload aria-hidden="true" /> Upload prescription
      </Link>
    </Button>
  );
}

export function PrescriptionsList() {
  const list = useResource(() => prescriptionsApi.list(), "list");

  return (
    <div className="space-y-8">
      <PageHeader title="Prescriptions" description="Prescriptions you’ve uploaded, newest first. Open one to check what was read from it." actions={<UploadButton />} />

      {list.status === "loading" ? (
        <LoadingState label="Loading prescriptions" rows={4} />
      ) : list.status === "error" ? (
        isNoPatientError(list.error) ? <NoPatientProfile /> : <ErrorState error={list.error} onRetry={list.reload} />
      ) : list.data.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No prescriptions yet"
          description="Upload a photo or PDF of a paper prescription. HealthHub reads it, then asks you to check the details."
          action={<UploadButton />}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableCaption className="sr-only">Your prescriptions, newest first</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Prescription</TableHead>
                  <TableHead>Medicines</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.map((rx) => {
                  const m = medicinesSummary(rx);
                  return (
                    <TableRow key={rx.id} className="align-top">
                      <TableCell className="space-y-1">
                        <Link href={`/prescriptions/${rx.id}`} className="text-info font-medium underline-offset-4 hover:underline">
                          {titleOf(rx)}
                        </Link>
                        <p className="text-muted-foreground text-xs">{rx.prescriberName ?? "Prescriber not provided"}</p>
                        {rx.isDemo ? <DemoTag /> : null}
                      </TableCell>
                      <TableCell className="max-w-64">
                        <p className="line-clamp-2">{m.names}</p>
                        {m.review > 0 ? <p className="text-warning text-xs font-medium">{m.review} need review</p> : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <ProcessingBadge status={rx.processingStatus} />
                          <VerificationBadge status={rx.verificationStatus} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <ChevronRight aria-hidden="true" className="text-muted-foreground inline size-4" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="divide-y rounded-md border md:hidden">
            {list.data.map((rx) => {
              const m = medicinesSummary(rx);
              return (
                <li key={rx.id}>
                  <Link href={`/prescriptions/${rx.id}`} className="hover:bg-muted/50 block space-y-2 px-4 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-info font-medium">{titleOf(rx)}</span>
                      {rx.isDemo ? <DemoTag /> : null}
                    </div>
                    <p className="text-muted-foreground text-sm">{m.names}</p>
                    {m.review > 0 ? <p className="text-warning text-xs font-medium">{m.review} need review</p> : null}
                    <div className="flex flex-wrap gap-1.5">
                      <ProcessingBadge status={rx.processingStatus} />
                      <VerificationBadge status={rx.verificationStatus} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="text-muted-foreground text-sm">
            Showing all {list.data.length} {list.data.length === 1 ? "prescription" : "prescriptions"}.
          </p>
        </>
      )}
    </div>
  );
}
