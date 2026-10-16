import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { authApi } from "../api/endpoints";
import { isApiError } from "../api/errors";
import { configureHttp } from "../api/http";
import type { AuthUser } from "../api/types";
import { API_CONFIG, IS_DEMO } from "../config";
import { demoFetch, resetDemo } from "../demo/demoFetch";
import { cancelLocalReminders } from "../lib/reminders";
import { DEMO_ACCOUNTS, type DemoAccount } from "../demo/accounts";
import { clearSession, loadSession, saveSession } from "./storage";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut"; notice: string | null }
  | { status: "signedIn"; user: AuthUser; expiresAt: string };

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  /** Demo mode only: one-tap sign-in through the in-app synthetic API. Throws in live mode. */
  signInDemo: (account: DemoAccount["id"]) => Promise<void>;
  /** Resolves with a note to show the user when the server could not confirm the logout. */
  signOut: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const tokenRef = useRef<string | null>(null);

  const endLocally = useCallback(async (notice: string | null) => {
    tokenRef.current = null;
    if (IS_DEMO) resetDemo();
    await clearSession();
    await cancelLocalReminders();
    setState({ status: "signedOut", notice });
  }, []);

  // Wire the HTTP client once. A 401 on an authenticated call ends the local session.
  useEffect(() => {
    configureHttp({
      baseUrl: API_CONFIG.baseUrl,
      ...(IS_DEMO ? { fetchImpl: demoFetch as typeof fetch } : {}),
      getToken: () => tokenRef.current,
      onUnauthorized: () => {
        if (tokenRef.current) void endLocally("Your session has ended. Sign in again to continue.");
      },
    });
  }, [endLocally]);

  // Restore a stored, unexpired session. The server still decides validity on the first request.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Demo sessions are never persisted: the in-memory demo data would not survive a restart anyway.
      const stored = IS_DEMO ? null : await loadSession();
      if (cancelled) return;
      if (stored && new Date(stored.expiresAt).getTime() > Date.now()) {
        tokenRef.current = stored.accessToken;
        setState({ status: "signedIn", user: stored.user, expiresAt: stored.expiresAt });
      } else {
        if (stored) await clearSession();
        setState({ status: "signedOut", notice: stored ? "Your session expired. Sign in again." : null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Swap the token for a fresh one shortly before it expires (backend L1: once per token, capped at the server's
  // login limit). If that fails the session simply ends at its expiry; nothing is faked.
  const expiresAt = state.status === "signedIn" ? state.expiresAt : null;
  const user = state.status === "signedIn" ? state.user : null;
  useEffect(() => {
    if (!expiresAt || !user) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Date(expiresAt).getTime();
    const signOutExpired = () => void endLocally("Your session expired. Sign in again.");

    const attempt = async () => {
      if (cancelled) return;
      if (Date.now() >= expiry) return signOutExpired();
      try {
        const next = await authApi.refresh();
        if (cancelled) return;
        if (!next?.accessToken || !next.user) throw new Error("Unexpected refresh response");
        tokenRef.current = next.accessToken;
        if (!IS_DEMO) await saveSession({ accessToken: next.accessToken, expiresAt: next.expiresAt, user: next.user });
        setState({ status: "signedIn", user: next.user, expiresAt: next.expiresAt });
      } catch (error) {
        if (cancelled) return;
        // 401: the server ended this login (revoked, deactivated or past its limit). Otherwise retry until expiry.
        if (isApiError(error) && error.isUnauthenticated) return signOutExpired();
        timer = setTimeout(() => void attempt(), Math.min(30_000, Math.max(expiry - Date.now(), 0)));
      }
    };

    timer = setTimeout(() => void attempt(), Math.max(expiry - 2 * 60_000 - Date.now(), 0));
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [expiresAt, user, endLocally]);

  const establish = useCallback(async (call: () => Promise<{ user: AuthUser; accessToken: string; expiresAt: string }>) => {
    const session = await call(); // throws ApiError; screens show the server's real result
    if (!session?.accessToken || !session.user) {
      throw new Error("Unexpected sign-in response");
    }
    tokenRef.current = session.accessToken;
    if (!IS_DEMO) await saveSession({ accessToken: session.accessToken, expiresAt: session.expiresAt, user: session.user });
    setState({ status: "signedIn", user: session.user, expiresAt: session.expiresAt });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signIn: (email, password) => establish(() => authApi.login(email.trim(), password)),
      register: (email, password) => establish(() => authApi.register(email.trim(), password)),
      signInDemo: (id) => {
        // Never available against a real server: nothing here may pretend to authenticate.
        if (!IS_DEMO) return Promise.reject(new Error("Demo sign-in is only available in demo mode"));
        const account = DEMO_ACCOUNTS[id];
        return establish(() => authApi.login(account.email, account.password));
      },
      signOut: async () => {
        let note: string | null = null;
        try {
          await authApi.logout();
        } catch (error) {
          note =
            isApiError(error) && error.isUnauthenticated
              ? null
              : "You're signed out on this phone, but HealthHub couldn't confirm the session ended on the server. It will expire on its own.";
        }
        await endLocally(note); // the Welcome screen shows the note, since this screen unmounts
        return note;
      },
    }),
    [state, establish, endLocally],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
