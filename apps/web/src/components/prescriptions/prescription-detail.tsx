"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BellRing, Download, Eye, LoaderCircle, PencilLine, RefreshCw, ShieldCheck, Trash2, TriangleAlert, UserPen } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { CorrectionForm } from "@/components/prescriptions/correction-form";
import { MedicationList } from "@/components/prescriptions/medication-list";
import { MedicationSetupWizard } from "@/components/prescriptions/medication-setup-wizard";
import { VersionHistory } from "@/components/prescriptions/version-history";
import { ContraindicationAlerts } from "@/components/prescriptions/contraindication-alerts";
import { DemoTag } from "@/components/status/demo-tag";
import { ProcessingBadge, VerificationBadge } from "@/components/status/verification-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeError, isApiError } from "@/lib/api/errors";
import { medicationSchedulesApi } from "@/lib/api/medication-schedules";
import { prescriptionsApi } from "@/lib/api/prescriptions";
import type { Prescription } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { SOURCE_TYPE_LABEL } from "@/lib/status";
import { useDocumentTitle } from "@/lib/use-document-title";
import { useResource } from "@/lib/use-resource";

const POLL_MS = 2000;
const SLOW_AFTER_MS = 60_000;

function StatusBanner({
  rx,
  onRetry,
  retrying,
  slow,
  onOpenWizard,
}: {
  rx: Prescription;
  onRetry: () => void;
  retrying: boolean;
  slow: boolean;
  onOpenWizard?: () => void;
}) {
  if (rx.processingStatus === "pending" || rx.processingStatus === "processing") {
    return (
      <Alert tone="info" role="status">
        <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
        <AlertTitle>{rx.processingStatus === "pending" ? "Waiting to be read" : "Reading your file"}</AlertTitle>
        <AlertDescription>
          <p>
            {slow ? "This is taking longer than usual. You can leave this page and come back; your file is saved." : "This page updates by itself. You can leave and come back; your file is saved."}
          </p>
          {rx.processingStatus === "pending" ? (
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry} disabled={retrying}>
              <RefreshCw aria-hidden="true" /> Start reading now
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }
  if (rx.processingStatus === "failed") {
    return (
      <Alert tone="danger">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>We couldn’t read this file</AlertTitle>
        <AlertDescription>
          <p>Try reading it again. If it keeps failing, upload a clearer photo or the original PDF.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry} disabled={retrying}>
            <RefreshCw aria-hidden="true" /> Try reading again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (rx.verificationStatus === "verified_by_authorized_clinician") {
    return (
      <Alert tone="success">
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>Verified by a clinician</AlertTitle>
        <AlertDescription>An authorized clinician has verified this record.</AlertDescription>
      </Alert>
    );
  }
  if (rx.verificationStatus === "patient_corrected") {
    return (
      <Alert tone="info">
        <UserPen aria-hidden="true" />
        <AlertTitle>You corrected these details</AlertTitle>
        <AlertDescription>Your corrections are saved as a new version. They are not verified by a clinician.</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert tone="success">
      <ShieldCheck aria-hidden="true" />
      <AlertTitle>Prescription extracted & added to medication reminders</AlertTitle>
      <AlertDescription>
        <p>All identified medicines have been automatically added to your Medication Schedule. You can review reminder times, adjust your schedule, and sync them to Google Calendar.</p>
        {rx.medications.length > 0 && onOpenWizard ? (
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <Button size="sm" onClick={onOpenWizard}>
              <BellRing className="mr-1.5 size-3.5" aria-hidden="true" /> Set Up Reminder Times & Google Calendar
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/medications">View in Medication Reminders</Link>
            </Button>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function RecordDetails({ rx, onViewFile }: { rx: Prescription; onViewFile: () => void }) {
  const rows: [string, React.ReactNode][] = [
    ["Prescriber", rx.prescriberName ?? <span key="no-prescriber" className="text-muted-foreground">Not provided</span>],
    ["Source", SOURCE_TYPE_LABEL[rx.sourceType]],
    [
      "Original file",
      (
        <div key="original-file-details" className="space-y-1">
          <span className="break-all font-medium text-xs">{rx.sourceFile ? rx.sourceFile.fileName : "Uploaded document"}</span>
          <button
            type="button"
            onClick={onViewFile}
            className="text-info block text-xs underline underline-offset-4 hover:opacity-80"
          >
            Open original prescription document →
          </button>
        </div>
      ),
    ],
    ["Added", formatDate(rx.createdAt)],
    ["Last updated", formatDate(rx.updatedAt)],
    ["Record ID", <code key="id" className="bg-muted rounded-sm px-1.5 py-0.5 font-mono text-xs break-all">{rx.id}</code>],
  ];
  return (
    <dl className="divide-y text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="space-y-0.5 py-3 first:pt-0">
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PrescriptionDetail({ id }: { id: string }) {
  const router = useRouter();
  const rx = useResource(() => prescriptionsApi.get(id), id);
  const [editing, setEditing] = React.useState(false);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [openingFile, setOpeningFile] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const startedAt = React.useRef<number | null>(null);
  const prevStatusRef = React.useRef<string | null>(null);
  const autoPromptedRef = React.useRef(false);
  const [slow, setSlow] = React.useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await prescriptionsApi.delete(id);
      toast.success("Prescription deleted successfully");
      router.push("/prescriptions");
    } catch (error) {
      const { title, detail } = describeError(error);
      toast.error("Failed to delete prescription", { description: `${title}. ${detail}` });
      setDeleting(false);
    }
  }

  const status = rx.status === "ready" ? rx.data.processingStatus : null;
  const stamp = rx.status === "ready" ? rx.data.updatedAt : "";
  const { setData } = rx;

  // Poll quietly (no skeleton flicker) while the file is being read.
  React.useEffect(() => {
    if (status !== "pending" && status !== "processing") return;
    startedAt.current ??= Date.now();
    const timer = setTimeout(async () => {
      try {
        setData(await prescriptionsApi.get(id));
      } catch {
        /* transient failure: try again on the next tick */
      }
      if (startedAt.current && Date.now() - startedAt.current > SLOW_AFTER_MS) setSlow(true);
      setTick((n) => n + 1);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [status, id, tick, setData]);

  // Prompt the medication reminder setup wizard as soon as the prescription reading finishes
  React.useEffect(() => {
    if (
      status === "completed" &&
      rx.status === "ready" &&
      rx.data.medications.length > 0 &&
      !autoPromptedRef.current
    ) {
      if (prevStatusRef.current === "pending" || prevStatusRef.current === "processing") {
        autoPromptedRef.current = true;
        setWizardOpen(true);
      }
    }
    prevStatusRef.current = status;
  }, [status, rx]);

  const schedules = useResource(() => medicationSchedulesApi.list(), `schedules:${id}:${status}`);
  const versions = useResource(() => prescriptionsApi.versions(id), `${id}:${status}:${stamp}`);
  useDocumentTitle(rx.status === "ready" ? (rx.data.prescriptionDate ? `Prescription from ${formatDate(rx.data.prescriptionDate)}` : "Prescription (undated)") : null);

  async function download() {
    setDownloading(true);
    try {
      const { blob, filename } = await prescriptionsApi.downloadPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename ?? `healthhub-prescription-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      const { title, detail } = describeError(error);
      toast.error("PDF couldn’t be downloaded", { description: `${title}. ${detail}` });
    } finally {
      setDownloading(false);
    }
  }

  async function viewOriginalFile() {
    setOpeningFile(true);
    try {
      const { blob } = await prescriptionsApi.downloadFile(id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      const { title, detail } = describeError(error);
      toast.error("Original prescription file could not be opened", { description: `${title}. ${detail}` });
    } finally {
      setOpeningFile(false);
    }
  }

  async function retry() {
    setRetrying(true);
    try {
      await prescriptionsApi.process(id);
      startedAt.current = Date.now();
      setSlow(false);
      setData(await prescriptionsApi.get(id));
    } catch (error) {
      const { title, detail } = describeError(error);
      toast.error("Couldn’t start reading", { description: `${title}. ${detail}` });
    } finally {
      setRetrying(false);
    }
  }

  const back = (
    <Link href="/prescriptions" className="text-info inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="size-4" /> All prescriptions
    </Link>
  );

  if (rx.status === "loading") {
    return (
      <div className="space-y-6">
        {back}
        <LoadingState label="Loading prescription" rows={4} />
      </div>
    );
  }

  if (rx.status === "error") {
    return (
      <div className="space-y-6">
        {back}
        {isApiError(rx.error) && rx.error.isNotFound ? (
          <EmptyState title="Prescription not found" description="It may have been removed, or it isn’t available to your account." />
        ) : (
          <ErrorState error={rx.error} onRetry={rx.reload} />
        )}
      </div>
    );
  }

  const p = rx.data;
  const title = p.prescriptionDate ? `Prescription from ${formatDate(p.prescriptionDate)}` : "Prescription (undated)";
  /** Corrections and the PDF only make sense once the file has been read. */
  const canCorrect = p.processingStatus === "completed";

  if (editing) {
    return (
      <div className="space-y-6">
        {back}
        <PageHeader title="Correct details" description={`${title}. Your original file and the automatic reading stay unchanged; your correction is saved as a new version.`} />
        <CorrectionForm
          prescription={p}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setData(updated);
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {back}
      <PageHeader
        title={title}
        actions={
          <>
            <Button variant="outline" onClick={viewOriginalFile} disabled={openingFile}>
              {openingFile ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Eye aria-hidden="true" />} View Original
            </Button>
            {canCorrect ? (
              <Button variant="outline" onClick={download} disabled={downloading}>
                {downloading ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download aria-hidden="true" />} Download PDF
              </Button>
            ) : null}
            {canCorrect && p.medications.length > 0 ? (
              <Button onClick={() => setWizardOpen(true)}>
                <BellRing aria-hidden="true" /> Set Up Reminders
              </Button>
            ) : null}
            {canCorrect ? (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <PencilLine aria-hidden="true" /> Correct details
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              <Trash2 className="size-4" aria-hidden="true" /> Delete
            </Button>
          </>
        }
      />
      <div className="-mt-4 flex flex-wrap items-center gap-2">
        <ProcessingBadge status={p.processingStatus} />
        <VerificationBadge status={p.verificationStatus} />
        {p.isDemo ? <DemoTag /> : null}
      </div>

      <StatusBanner rx={p} onRetry={retry} retrying={retrying} slow={slow} onOpenWizard={() => setWizardOpen(true)} />

      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0 space-y-10">
          <ContraindicationAlerts prescriptionId={p.id} status={p.processingStatus} />

          <section aria-labelledby="medicines" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="medicines" className="text-lg">
                Medicines
              </h2>
              <Button asChild variant="outline" size="sm">
                <Link href="/medications">View in Medication Reminders</Link>
              </Button>
            </div>
            {p.medications.length > 0 ? (
              <MedicationList medications={p.medications} />
            ) : p.processingStatus === "completed" ? (
              <EmptyState title="No medicines were found" description="Nothing could be read as a medicine from this file. Use Correct details to enter them from your paper prescription." />
            ) : (
              <p className="text-muted-foreground text-sm">Medicines appear here once the file has been read.</p>
            )}
          </section>

          <section aria-labelledby="history" className="space-y-4">
            <div className="max-w-prose space-y-1">
              <h2 id="history" className="text-lg">
                History
              </h2>
              <p className="text-muted-foreground text-sm">Every reading and correction is kept. Earlier values are never erased.</p>
            </div>
            {versions.status === "loading" ? (
              <LoadingState label="Loading history" rows={2} />
            ) : versions.status === "error" ? (
              <ErrorState error={versions.error} onRetry={versions.reload} />
            ) : versions.data.length === 0 ? (
              <p className="text-muted-foreground text-sm">No readings yet.</p>
            ) : (
              <VersionHistory versions={versions.data} />
            )}
          </section>
        </div>

        <aside aria-labelledby="record" className="space-y-3">
          <h2 id="record" className="text-lg">
            Record details
          </h2>
          <RecordDetails rx={p} onViewFile={viewOriginalFile} />
        </aside>
      </div>

      {wizardOpen ? (
        <MedicationSetupWizard
          key={`${p.id}-${p.updatedAt}-${schedules.status === "ready" ? "ready" : "loading"}`}
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          prescription={p}
          existingSchedules={schedules.status === "ready" ? schedules.data : []}
          onCompleted={() => {
            rx.reload();
            schedules.reload();
          }}
        />
      ) : null}

      {confirmDeleteOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-prescription-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="bg-card w-full max-w-md rounded-xl border p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <span className="bg-destructive/10 text-destructive flex size-9 items-center justify-center rounded-full">
                <Trash2 className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="delete-prescription-title" className="text-base font-semibold text-foreground">
                  Delete Prescription
                </h2>
                <p className="text-muted-foreground text-xs">
                  Permanent removal of health record
                </p>
              </div>
            </div>

            <p className="text-muted-foreground text-sm leading-relaxed">
              Are you sure you want to delete this prescription? This will permanently remove:
            </p>

            <ul className="text-muted-foreground list-disc pl-5 text-xs space-y-1">
              <li>The uploaded original prescription document</li>
              <li>All extracted medication details and history</li>
              <li>Any medication reminders created from this prescription</li>
            </ul>

            <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-xs font-medium">
              This action cannot be undone.
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <LoaderCircle className="animate-spin size-4 mr-1.5" aria-hidden="true" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="size-4 mr-1.5" aria-hidden="true" />
                    Delete Prescription
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
