import { Badge } from "@/components/ui/badge";
import { DEMO_STATUS } from "@/lib/status";

/** Inline label for any record that comes from the demo adapter. Render it next to the record, not only in the page banner. */
export function DemoTag({ className }: { className?: string }) {
  const Icon = DEMO_STATUS.icon;
  return (
    <Badge tone="demo" className={className} title={DEMO_STATUS.explanation}>
      <Icon aria-hidden="true" />
      {DEMO_STATUS.label}
    </Badge>
  );
}
