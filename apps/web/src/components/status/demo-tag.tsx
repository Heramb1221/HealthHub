import { Badge } from "@/components/ui/badge";
import { DEMO_STATUS } from "@/lib/status";

export function DemoTag({ className }: { className?: string }) {
  const Icon = DEMO_STATUS.icon;
  return (
    <Badge tone="demo" className={className} title={DEMO_STATUS.explanation}>
      <Icon aria-hidden="true" />
      {DEMO_STATUS.label}
    </Badge>
  );
}
