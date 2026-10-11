import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { authApi } from "../api/endpoints";
import { isApiError } from "../api/errors";
import { configureHttp } from "../api/http";
import type { AuthUser } from "../api/types";
import { API_CONFIG } from "../config";
import { cancelLocalReminders } from "../lib/reminders";
import { clearSession, loadSession, saveSession } from "./storage";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut"; notice: string | null }
  | { status: "signedIn"; user: AuthUser; expiresAt: string };

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  /** Resolves with a note to show the user when the server could not confirm the logout. */
  signOut: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const tokenRef = useRef<string | null>(null);

  const endLocally = useCallback(async (notice: string | null) => {
    tokenRef.current = null;
    await clearSession();
    await cancelLocalReminders();
    setState({ status: "signedOut", notice });
  }, []);

  // Wire the HTTP client once. A 401 on an authenticated call ends the local session.
  useEffect(() => {
    configureHttp({
      baseUrl: API_CONFIG.baseUrl,
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
      const stored = await loadSession();
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

  // Sign out at the token's expiry (access tokens are short-lived and there is no refresh in the MVP).
  const expiresAt = state.status === "signedIn" ? state.expiresAt : null;
  useEffect(() => {
    if (!expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    const timer = setTimeout(() => void endLocally("Your session expired. Sign in again."), Math.max(ms, 0));
    return () => clearTimeout(timer);
  }, [expiresAt, endLocally]);

  const establish = useCallback(async (call: () => Promise<{ user: AuthUser; accessToken: string; expiresAt: string }>) => {
    const session = await call(); // throws ApiError; screens show the server's real result
    if (!session?.accessToken || !session.user) {
      throw new Error("Unexpected sign-in response");
    }
    tokenRef.current = session.accessToken;
    await saveSession({ accessToken: session.accessToken, expiresAt: session.expiresAt, user: session.user });
    setState({ status: "signedIn", user: session.user, expiresAt: session.expiresAt });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      signIn: (email, password) => establish(() => authApi.login(email.trim(), password)),
      register: (email, password) => establish(() => authApi.register(email.trim(), password)),
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
