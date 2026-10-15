import { FlaskConical } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { IS_DEMO } from "@/lib/api/config";

/** Shown only in demo mode. These are synthetic accounts that exist only in this browser. */
export function DemoAccounts() {
  if (!IS_DEMO) return null;
  // Required only in demo builds, so the demo credentials never exist in a live build's code.
  const DEMO_ACCOUNTS =
    process.env.NEXT_PUBLIC_API_MODE === "live"
      ? []
      : // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require("@/lib/demo/auth") as typeof import("@/lib/demo/auth")).DEMO_ACCOUNTS;
  return (
    <Alert tone="demo">
      <FlaskConical aria-hidden="true" />
      <AlertTitle>Demo accounts</AlertTitle>
      <AlertDescription>
        <p>Development-only sign-in. These accounts are synthetic and are not verified by any provider.</p>
        <dl className="mt-3 space-y-3 text-sm">
          {DEMO_ACCOUNTS.map((account) => (
            <div key={account.id}>
              <dt className="text-foreground font-medium">{account.role === "admin" ? "Administrator" : "Patient"}</dt>
              <dd className="font-mono text-xs break-all">{account.email}</dd>
              <dd className="font-mono text-xs">{account.password}</dd>
            </div>
          ))}
        </dl>
      </AlertDescription>
    </Alert>
  );
}
