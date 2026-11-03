
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  useAuth as useClerkAuth,
  useUser as useClerkUser,
  useClerk,
} from "@clerk/expo";

import { configureHttp } from "../api/http";
import type { AuthUser } from "../api/types";
import { API_CONFIG } from "../config";
import { cancelLocalReminders } from "../lib/reminders";
import { setRemindersEnabled } from "../lib/reminderSettings";
import type { DemoAccount } from "../demo/accounts";

import { clearSession, saveSession } from "./storage";
import * as flows from "./clerkFlows.ts";

import type {
  ClerkClientLike,
  FlowOutcome,
  PendingVerification,
  RegisterInput,
} from "./clerkFlows.ts";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut"; notice: string | null }
  | { status: "signedIn"; user: AuthUser; expiresAt: string };

export interface AuthContextValue {
  state: AuthState;
  pending: PendingVerification | null;

  signIn: (
    identifier: string,
    password: string
  ) => Promise<FlowOutcome>;

  startPhoneSignIn: (
    phoneE164: string
  ) => Promise<FlowOutcome>;

  register: (input: RegisterInput) => Promise<FlowOutcome>;

  verifyCode: (code: string) => Promise<FlowOutcome>;

  resendCode: () => Promise<void>;

  cancelVerification: () => void;

  signInDemo: (account: DemoAccount["id"]) => Promise<void>;

  signOut: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const clerk = useClerk();

  const {
    isLoaded: isClerkLoaded,
    isSignedIn: isClerkSignedIn,
    getToken,
  } = useClerkAuth();

  const { user: clerkUser, isLoaded: isUserLoaded } = useClerkUser();

  const clerkUserId = clerkUser?.id;
  const clerkEmail =
    clerkUser?.primaryEmailAddress?.emailAddress ?? "";

  const [state, setState] = useState<AuthState>({
    status: "loading",
  });

  const [pending, setPending] =
    useState<PendingVerification | null>(null);

  const tokenRef = useRef<string | null>(null);

  const getTokenRef = useRef(getToken);

  const pendingRef = useRef<PendingVerification | null>(null);

  // Always use the latest Clerk token getter.
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  // Clear the application's local session and reminders.
  const endLocally = useCallback(async (notice: string | null) => {
    tokenRef.current = null;

    await clearSession();
    await cancelLocalReminders();
    await setRemindersEnabled(false);

    setState({
      status: "signedOut",
      notice,
    });
  }, []);

  // Configure the API client.
  useEffect(() => {
    configureHttp({
      baseUrl: API_CONFIG.baseUrl,

      getToken: async () => {
        try {
          const freshToken = await getTokenRef.current();

          tokenRef.current = freshToken ?? null;

          return freshToken ?? null;
        } catch {
          return tokenRef.current;
        }
      },

      onUnauthorized: () => {
        if (tokenRef.current) {
          void endLocally(
            "Your session has ended. Sign in again to continue."
          );
        }
      },
    });
  }, [endLocally]);

  // Synchronize Clerk's authentication state with our application state.
  useEffect(() => {
    if (!isClerkLoaded) return;

    let cancelled = false;

    if (!isClerkSignedIn) {
      tokenRef.current = null;

      void Promise.resolve().then(() => {
        if (cancelled) return;

        setState((previous) => {
          if (
            previous.status === "signedOut" &&
            previous.notice === null
          ) {
            return previous;
          }

          return {
            status: "signedOut",
            notice: null,
          };
        });
      });

      return () => {
        cancelled = true;
      };
    }

    // Wait until Clerk has loaded the authenticated user.
    if (!isUserLoaded || !clerkUserId) {
      return;
    }

    void (async () => {
      try {
        const token = await getTokenRef.current();

        if (cancelled) return;

        if (!token) {
          throw new Error(
            "Clerk did not provide an authentication token."
          );
        }

        tokenRef.current = token;

        const user: AuthUser = {
          id: clerkUserId,
          email: clerkEmail,
          role: "patient",
        };

        const expiresAt = new Date(
          Date.now() + 3600_000
        ).toISOString();

        await saveSession({
          accessToken: token,
          expiresAt,
          user,
        });

        if (cancelled) return;

        setState({
          status: "signedIn",
          user,
          expiresAt,
        });

        console.log("[AUTH] Application session synchronized.");
      } catch (error) {
        if (cancelled) return;

        console.error(
          "[AUTH] Session synchronization failed:",
          error
        );

        tokenRef.current = null;

        setState({
          status: "signedOut",
          notice:
            "Unable to establish your session. Please try signing in again.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isClerkLoaded,
    isClerkSignedIn,
    isUserLoaded,
    clerkUserId,
    clerkEmail,
  ]);

  // Activate a completed Clerk authentication flow.
  const activate = useCallback(
    async (outcome: FlowOutcome): Promise<FlowOutcome> => {
      if (outcome.status === "complete") {
        try {
          console.log("[AUTH] Authentication completed.");
          console.log("[AUTH] Activating Clerk session.");

          await clerk.setActive({
            session: outcome.sessionId,
          });

          console.log("[AUTH] Clerk session activated.");

          pendingRef.current = null;
          setPending(null);

          // The synchronization effect above will obtain the
          // authenticated user and token and update application state.
        } catch (error) {
          console.error(
            "[AUTH] Clerk session activation failed:",
            error
          );

          throw error;
        }
      } else {
        pendingRef.current = outcome.pending;
        setPending(outcome.pending);
      }

      return outcome;
    },
    [clerk]
  );

  // Ensure Clerk is ready before starting authentication flows.
  const requireClerk = useCallback((): ClerkClientLike => {
    if (!clerk.loaded) {
      throw new flows.AuthFlowError(
        "not_ready",
        "Sign-in isn't ready yet. Wait a moment and try again."
      );
    }

    return clerk as unknown as ClerkClientLike;
  }, [clerk]);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      return activate(
        await flows.signInWithPassword(
          requireClerk(),
          identifier,
          password
        )
      );
    },
    [activate, requireClerk]
  );

  const startPhoneSignIn = useCallback(
    async (phoneE164: string) => {
      return activate(
        await flows.startPhoneCodeSignIn(
          requireClerk(),
          phoneE164
        )
      );
    },
    [activate, requireClerk]
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      return activate(
        await flows.register(
          requireClerk(),
          input
        )
      );
    },
    [activate, requireClerk]
  );

  const verifyCode = useCallback(
    async (code: string) => {
      const current = pendingRef.current;

      if (!current) {
        throw new flows.AuthFlowError(
          "nothing_pending",
          "There is no verification in progress. Start again."
        );
      }

      return activate(
        await flows.verifyCode(
          requireClerk(),
          current,
          code
        )
      );
    },
    [activate, requireClerk]
  );

  const resendCode = useCallback(async () => {
    const current = pendingRef.current;

    if (!current) {
      throw new flows.AuthFlowError(
        "nothing_pending",
        "There is no verification in progress. Start again."
      );
    }

    await flows.resendCode(
      requireClerk(),
      current
    );
  }, [requireClerk]);

  const cancelVerification = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
  }, []);

  // Sign out from Clerk and clear local application data.
  const signOut = useCallback(async () => {
    tokenRef.current = null;

    pendingRef.current = null;
    setPending(null);

    await cancelLocalReminders();
    await setRemindersEnabled(false);
    await clearSession();

    try {
      await clerk.signOut();
    } catch (error) {
      console.error("[AUTH] Clerk sign-out error:", error);
    }

    await endLocally(null);

    return null;
  }, [clerk, endLocally]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      pending,

      signIn,
      startPhoneSignIn,
      register,
      verifyCode,
      resendCode,
      cancelVerification,

      signInDemo: () =>
        Promise.reject(
          new Error(
            "Demo accounts have been disabled. Please use real sign in."
          )
        ),

      signOut,
    }),
    [
      state,
      pending,
      signIn,
      startPhoneSignIn,
      register,
      verifyCode,
      resendCode,
      cancelVerification,
      signOut,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}
