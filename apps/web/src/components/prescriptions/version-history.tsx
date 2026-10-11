import { ArrowRight, Bot, UserPen } from "lucide-react";

import type { PrescriptionVersion } from "@/lib/api/types";
import { diffVersions, FIELD_LABEL, type Change } from "@/lib/prescription-diff";
import { formatDate } from "@/lib/format";

function formatStamp(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function Value({ value }: { value: string | null | undefined }) {
  return value ? <span>{value}</span> : <span className="text-muted-foreground">not found</span>;
}

function ChangeLine({ change }: { change: Change }) {
  if (change.kind === "added") return <li>Added medicine: {change.medication}</li>;
  if (change.kind === "removed") return <li>Removed medicine: {change.medication}</li>;
  return (
    <li className="flex flex-wrap items-center gap-x-1.5">
      <span>
        {change.medication}
        {change.field ? ` · ${FIELD_LABEL[change.field]}:` : " · Prescriber:"}
      </span>
      <Value value={change.before} />
      <ArrowRight aria-hidden="true" className="size-3.5" />
      <Value value={change.after} />
    </li>
  );
}

/** Every reading and correction is kept. Earlier values stay visible here and are never overwritten. */
export function VersionHistory({ versions }: { versions: PrescriptionVersion[] }) {
  return (
    <ol className="space-y-6">
      {[...versions].reverse().map((version) => {
        const index = versions.findIndex((v) => v.id === version.id);
        const changes = diffVersions(versions[index - 1] ?? null, version);
        const correction = version.kind === "patient_correction";
        const Icon = correction ? UserPen : Bot;
        return (
          <li key={version.id} className="border-border relative border-l-2 pl-5">
            <Icon aria-hidden="true" className="text-muted-foreground bg-background absolute top-0.5 -left-[11px] size-5" />
            <p className="text-sm font-medium">
              Version {version.versionNumber} · {correction ? "Your correction" : "Automatic reading"}
            </p>
            <p className="text-muted-foreground text-xs">{formatStamp(version.createdAt)}</p>
            {correction ? (
              changes.length ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {changes.map((c, i) => (
                    <ChangeLine key={i} change={c} />
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-2 text-sm">Saved with no changes to the values.</p>
              )
            ) : (
              <p className="text-muted-foreground mt-2 text-sm">
                {version.medications.length} {version.medications.length === 1 ? "medicine" : "medicines"} read
                {version.prescriptionDate ? ` · dated ${formatDate(version.prescriptionDate)}` : ""}.
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
