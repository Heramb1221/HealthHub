"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { LoadingState } from "@/components/feedback/states";
import { ErrorState } from "@/components/feedback/states";
import { authApi } from "@/lib/api/auth";
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
 * Client-side gate for the signed-in area. It asks the auth module who is signed in, sends visitors
 * without a session to /sign-in (remembering where they were going), and only then renders children.
 * This is a convenience, not security: the API authorizes every request.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = React.useState<SessionState>({ status: "loading" });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    authApi
      .getSession()
      .then((user) => {
        if (cancelled) return;
        if (user) setState({ status: "signed-in", user });
        else router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, pathname, router]);

  const signOut = React.useCallback(async () => {
    await authApi.logout();
    router.replace("/sign-in");
  }, [router]);

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

  if (state.status === "loading") {
    return (
      <main id="main" className="mx-auto max-w-3xl px-4 py-16">
        <LoadingState label="Checking your session" />
      </main>
    );
  }

  return <SessionContext.Provider value={{ user: state.user, signOut }}>{children}</SessionContext.Provider>;
}
