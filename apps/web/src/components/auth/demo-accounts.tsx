"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, LoaderCircle, LogIn } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { IS_DEMO } from "@/lib/api/config";
import { authApi } from "@/lib/api/auth";

export function DemoAccounts() {
  const router = useRouter();
  const [signingInId, setSigningInId] = React.useState<string | null>(null);

  if (!IS_DEMO) return null;

  const DEMO_ACCOUNTS =
    process.env.NEXT_PUBLIC_API_MODE === "live"
      ? []
      : // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require("@/lib/demo/auth") as typeof import("@/lib/demo/auth")).DEMO_ACCOUNTS;

  async function handleQuickSignIn(account: { email: string; password: string; role: string; id: string }) {
    try {
      setSigningInId(account.id);
      const user = await authApi.login({ email: account.email, password: account.password });
      router.replace(user.role === "admin" ? "/admin" : "/dashboard");
    } finally {
      setSigningInId(null);
    }
  }

  return (
    <Alert tone="demo">
      <FlaskConical aria-hidden="true" />
      <AlertTitle>Demo accounts</AlertTitle>
      <AlertDescription>
        <p>Development-only sign-in. Click below for instant one-click sign in:</p>
        <div className="mt-3 space-y-3 text-sm">
          {DEMO_ACCOUNTS.map((account) => (
            <div
              key={account.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 rounded-md border border-amber-200/50 bg-amber-50/50 dark:bg-amber-950/20"
            >
              <div>
                <div className="text-foreground font-medium">{account.role === "admin" ? "Administrator" : "Patient"}</div>
                <div className="font-mono text-xs text-muted-foreground">{account.email}</div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={signingInId !== null}
                onClick={() => handleQuickSignIn(account)}
                className="shrink-0"
              >
                {signingInId === account.id ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <LogIn className="size-3.5" aria-hidden="true" />
                )}
                <span>Sign in as {account.role === "admin" ? "Admin" : "Patient"}</span>
              </Button>
            </div>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
