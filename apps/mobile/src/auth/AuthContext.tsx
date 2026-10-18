import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth as useClerkAuth, useUser as useClerkUser, useClerk } from "@clerk/expo";

import { configureHttp } from "../api/http";
import type { AuthUser } from "../api/types";
import { API_CONFIG } from "../config";
import { cancelLocalReminders } from "../lib/reminders";
import type { DemoAccount } from "../demo/accounts";
import { clearSession, saveSession } from "./storage";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut"; notice: string | null }
  | { status: "signedIn"; user: AuthUser; expiresAt: string };

export interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<{ needsVerification?: boolean } | void>;
  verifyCode: (code: string) => Promise<void>;
  /** Demo mode is disabled. */
  signInDemo: (account: DemoAccount["id"]) => Promise<void>;
  /** Resolves with a note to show the user when the server could not confirm the logout. */
  signOut: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const clerk = useClerk();
  const { isLoaded: isClerkLoaded, isSignedIn: isClerkSignedIn, getToken } = useClerkAuth();
  const { user: clerkUser } = useClerkUser();

  const [state, setState] = useState<AuthState>({ status: "loading" });
  const tokenRef = useRef<string | null>(null);

  const endLocally = useCallback(async (notice: string | null) => {
    tokenRef.current = null;
    await clearSession();
    await cancelLocalReminders();
    setState({ status: "signedOut", notice });
  }, []);

  // Configure HTTP client once
  useEffect(() => {
    configureHttp({
      baseUrl: API_CONFIG.baseUrl,
      getToken: () => tokenRef.current,
      onUnauthorized: () => {
        if (tokenRef.current) void endLocally("Your session has ended. Sign in again to continue.");
      },
    });
  }, [endLocally]);

  // Sync Clerk authentication state
  useEffect(() => {
    if (!isClerkLoaded) return;
    let cancelled = false;

    if (!isClerkSignedIn) {
      tokenRef.current = null;
      void Promise.resolve().then(() => {
        if (!cancelled) {
          setState((prev) => (prev.status === "signedOut" && !prev.notice ? prev : { status: "signedOut", notice: null }));
        }
      });
      return;
    }

    void (async () => {
      try {
        const token = await getToken();
        if (cancelled) return;
        tokenRef.current = token;

        const email = clerkUser?.primaryEmailAddress?.emailAddress ?? "";

        const user: AuthUser = {
          id: clerkUser?.id ?? "clerk-user",
          email,
          role: "patient",
        };

        const expiresAt = new Date(Date.now() + 3600_000).toISOString();
        if (token) {
          await saveSession({ accessToken: token, expiresAt, user });
        }
        setState({ status: "signedIn", user, expiresAt });
      } catch {
        if (!cancelled) {
          setState({ status: "signedOut", notice: "Failed to establish session." });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isClerkLoaded, isClerkSignedIn, clerkUser, getToken]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!clerk.loaded) throw new Error("Authentication is not ready");
      const result = await clerk.client.signIn.create({
        identifier: email.trim(),
        password,
      });
      if (result.status === "complete" && result.createdSessionId) {
        await clerk.setActive({ session: result.createdSessionId });
        const token = await getToken();
        tokenRef.current = token;
      } else {
        throw new Error(`Sign in incomplete: ${result.status}`);
      }
    },
    [clerk, getToken],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      if (!clerk.loaded) throw new Error("Authentication is not ready");
      const result = await clerk.client.signUp.create({
        emailAddress: email.trim(),
        password,
      });
      if (result.status === "complete" && result.createdSessionId) {
        await clerk.setActive({ session: result.createdSessionId });
        const token = await getToken();
        tokenRef.current = token;
        return { needsVerification: false };
      } else if (result.status === "missing_requirements") {
        await clerk.client.signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        return { needsVerification: true };
      } else {
        throw new Error(`Sign up incomplete: ${result.status}`);
      }
    },
    [clerk, getToken],
  );

  const verifyCode = useCallback(
    async (code: string) => {
      if (!clerk.loaded) throw new Error("Authentication is not ready");
      const result = await clerk.client.signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (result.status === "complete" && result.createdSessionId) {
        await clerk.setActive({ session: result.createdSessionId });
        const token = await getToken();
        tokenRef.current = token;
      } else {
        throw new Error("Invalid verification code. Please check and try again.");
      }
    },
    [clerk, getToken],
  );

  const signOut = useCallback(async () => {
    tokenRef.current = null;
    await cancelLocalReminders();
    await clearSession();
    try {
      await clerk.signOut();
    } catch {
      // Ignored
    }
    await endLocally(null);
    return null;
  }, [clerk, endLocally]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signIn,
      register,
      verifyCode,
      signInDemo: () => Promise.reject(new Error("Demo accounts have been disabled. Please use real sign in.")),
      signOut,
    }),
    [state, signIn, register, verifyCode, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
