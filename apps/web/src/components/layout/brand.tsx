import Link from "next/link";
import { HeartPulse } from "lucide-react";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="text-primary inline-flex items-center gap-2 font-semibold tracking-tight">
      <HeartPulse aria-hidden="true" className="text-accent-foreground size-6" />
      <span className="text-lg">HealthHub</span>
    </Link>
  );
}
