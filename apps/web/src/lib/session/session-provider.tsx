"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, useUser, useClerk } from "@clerk/nextjs";

import { LoadingState } from "@/components/feedback/states";
import { ErrorState } from "@/components/feedback/states";
import { authApi } from "@/lib/api/auth";
import { setAuthToken } from "@/lib/api/http";
import type { AuthUser } from "@/lib/api/types";

type SessionState =
  | { status: "loading" }
  | { status: "signed-in"; user: AuthUser }
  | { status: "error"; error: unknown };

interface SessionContextValue {
  user: AuthUser;
  signOut: () => Promise<void>;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = React.useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionGate>");
  return value;
}

/**
 * Client-side gate for the signed-in area. It verifies the Clerk session,
 * syncs the Clerk session token with HealthHub API client, and provides the user context.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const { signOut: clerkSignOut } = useClerk();

  const [state, setState] = React.useState<SessionState>({ status: "loading" });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setAuthToken(null);
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (cancelled) return;
        if (token) setAuthToken(token);

        let user = await authApi.getSession().catch(() => null);
        if (!user && clerkUser) {
          user = {
            id: clerkUser.id,
            email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
            role: "patient",
            displayName: clerkUser.fullName || clerkUser.firstName || clerkUser.username || "User",
          };
        }
        if (cancelled) return;
        if (user) {
          setState({ status: "signed-in", user });
        } else {
          router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
        }
      } catch (error: unknown) {
        if (!cancelled) setState({ status: "error", error });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, clerkUser, getToken, attempt, pathname, router]);

  const signOut = React.useCallback(async () => {
    setAuthToken(null);
    await clerkSignOut();
    router.replace("/sign-in");
  }, [clerkSignOut, router]);

  if (!isLoaded || state.status === "loading") {
    return (
      <main id="main" className="mx-auto max-w-3xl px-4 py-16">
        <LoadingState label="Checking your session" />
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main id="main" className="mx-auto max-w-3xl px-4 py-16">
        <ErrorState
          error={state.error}
          onRetry={() => {
            setState({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
        />
      </main>
    );
  }

  return <SessionContext.Provider value={{ user: state.user, signOut }}>{children}</SessionContext.Provider>;
}
