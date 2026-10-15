"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api/auth";
import { safeNextPath } from "@/lib/forms";

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="size-4 fill-current" viewBox="0 0 170 170" aria-hidden="true">
      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.05-7.62-7.85-11.77-14.39-6.08-9.59-10.97-20.48-14.67-32.66-3.7-12.18-5.55-23.77-5.55-34.78 0-14.39 3.59-26.47 10.77-36.23 7.18-9.76 16.29-14.73 27.34-14.92 5.23 0 11.05 1.42 17.45 4.26 6.4 2.83 10.4 4.35 12 4.54 2.05-.27 6.27-1.85 12.67-4.73 6.4-2.88 12.02-4.17 16.85-3.87 12.62.71 22.44 5.37 29.47 13.99-10.99 6.64-16.38 15.84-16.16 27.59.22 9.14 3.7 16.82 10.45 23.04 6.75 6.23 14.86 9.87 24.32 10.93-2.07 6.53-4.58 13.32-7.53 20.36zm-31.55-103.5c-.13 3.48-1.32 7.18-3.57 11.1-2.25 3.92-5.11 7.23-8.58 9.92-3.47 2.7-7.23 4.45-11.27 5.25-.33-3.48.74-7.07 3.22-10.77 2.48-3.7 5.56-6.85 9.24-9.45 3.68-2.6 7.34-4.28 10.96-5.05z" />
    </svg>
  );
}

export function ProviderButtons({ next }: { next?: string }) {
  const router = useRouter();
  const [loadingProvider, setLoadingProvider] = React.useState<"google" | "apple" | null>(null);

  async function handleProviderLogin(provider: "google" | "apple") {
    try {
      setLoadingProvider(provider);
      await authApi.loginWithProvider(provider);
      router.replace(safeNextPath(next) ?? "/dashboard");
    } catch {
      setLoadingProvider(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          disabled={loadingProvider !== null}
          onClick={() => handleProviderLogin("google")}
          aria-label="Continue with Google"
          className="flex items-center justify-center gap-2"
        >
          {loadingProvider === "google" ? (
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <GoogleIcon />
          )}
          <span>{loadingProvider === "google" ? "Connecting..." : "Continue with Google"}</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={loadingProvider !== null}
          onClick={() => handleProviderLogin("apple")}
          aria-label="Continue with Apple"
          className="flex items-center justify-center gap-2"
        >
          {loadingProvider === "apple" ? (
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <AppleIcon />
          )}
          <span>{loadingProvider === "apple" ? "Connecting..." : "Continue with Apple"}</span>
        </Button>
      </div>
      <p id="providers-note" className="text-muted-foreground text-xs text-center">
        Sandbox OAuth: Instant one-click sign in with a verified demo profile.
      </p>
    </div>
  );
}
