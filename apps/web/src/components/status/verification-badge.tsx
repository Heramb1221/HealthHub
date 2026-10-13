import { Badge } from "@/components/ui/badge";
import type { ProcessingStatus, VerificationStatus } from "@/lib/api/types";
import { PROCESSING_STATUS, VERIFICATION_STATUS, type StatusDescriptor } from "@/lib/status";
import { cn } from "@/lib/utils";

function StatusBadge({ descriptor, className, spin }: { descriptor: StatusDescriptor; className?: string; spin?: boolean }) {
  const Icon = descriptor.icon;
  return (
    <Badge tone={descriptor.tone} className={className} title={descriptor.explanation}>
      <Icon aria-hidden="true" className={cn(spin && "animate-spin motion-reduce:animate-none")} />
      {descriptor.label}
    </Badge>
  );
}

export function VerificationBadge({ status, className }: { status: VerificationStatus; className?: string }) {
  return <StatusBadge descriptor={VERIFICATION_STATUS[status]} className={className} />;
}

export function ProcessingBadge({ status, className }: { status: ProcessingStatus; className?: string }) {
  return <StatusBadge descriptor={PROCESSING_STATUS[status]} className={className} spin={status === "processing"} />;
}
