import { CheckCircle2, FileSearch, UserPen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PrescriptionMedication } from "@/lib/api/types";
import { isInstructionSafe, medicationReviewReasons, REVIEW_REASON_LABEL } from "@/lib/prescription-safety";

function Value({ value }: { value: string | null }) {
  return value ? <>{value}</> : <span className="text-muted-foreground">Not found</span>;
}

/** One medicine's reading state: entered by the patient, read clearly, or needs review (with reasons). */
function ReadingState({ med }: { med: PrescriptionMedication }) {
  if (med.source === "patient_entered") {
    return (
      <div className="space-y-1">
        <Badge tone="info">
          <UserPen aria-hidden="true" /> Entered by you
        </Badge>
        <p className="text-muted-foreground text-xs">Not verified by a clinician</p>
      </div>
    );
  }
  const reasons = medicationReviewReasons(med);
  if (isInstructionSafe(med)) {
    return (
      <div className="space-y-1">
        <Badge tone="success">
          <CheckCircle2 aria-hidden="true" /> Read clearly
        </Badge>
        <p className="text-muted-foreground text-xs">{Math.round(med.confidence * 100)}% confidence</p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Badge tone="warning">
        <FileSearch aria-hidden="true" /> Needs review
      </Badge>
      <ul className="text-muted-foreground text-xs">
        {reasons.map((r) => (
          <li key={r}>{REVIEW_REASON_LABEL[r]}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Medicines read from a prescription. A medicine that needs review never shows a dose instruction
 * on its own: missing values are written as "Not found", never filled in or guessed.
 */
export function MedicationList({ medications }: { medications: PrescriptionMedication[] }) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableCaption className="sr-only">Medicines read from this prescription</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Medicine</TableHead>
              <TableHead>Strength</TableHead>
              <TableHead>Dose</TableHead>
              <TableHead>How often</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Instructions</TableHead>
              <TableHead>Reading</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {medications.map((med, index) => (
              <TableRow key={`${med.name}-${index}`} className="align-top">
                <TableCell className="font-medium">
                  <Value value={med.name} />
                </TableCell>
                <TableCell>
                  <Value value={med.strength} />
                </TableCell>
                <TableCell>
                  <Value value={med.dose} />
                </TableCell>
                <TableCell>
                  <Value value={med.frequency} />
                </TableCell>
                <TableCell>
                  <Value value={med.duration} />
                </TableCell>
                <TableCell className="max-w-48">
                  <Value value={med.instructions} />
                </TableCell>
                <TableCell>
                  <ReadingState med={med} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y rounded-md border md:hidden">
        {medications.map((med, index) => (
          <li key={`${med.name}-${index}`} className="space-y-3 px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-medium">
                <Value value={med.name} />
              </p>
              <ReadingState med={med} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {(
                [
                  ["Strength", med.strength],
                  ["Dose", med.dose],
                  ["How often", med.frequency],
                  ["Duration", med.duration],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd>
                    <Value value={value} />
                  </dd>
                </div>
              ))}
              <div className="col-span-2">
                <dt className="text-muted-foreground text-xs">Instructions</dt>
                <dd>
                  <Value value={med.instructions} />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
