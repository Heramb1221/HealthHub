import { AppShell } from "@/components/layout/app-shell";
import { SessionGate } from "@/lib/session/session-provider";

/** Signed-in area: patient screens (and, in slice 8, the admin portal). */
export default function SignedInLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate>
      <AppShell>{children}</AppShell>
    </SessionGate>
  );
}
