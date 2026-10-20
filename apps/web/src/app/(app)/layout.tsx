import { AppShell } from "@/components/layout/app-shell";
import { SessionGate } from "@/lib/session/session-provider";

export default function SignedInLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate>
      <AppShell>{children}</AppShell>
    </SessionGate>
  );
}
