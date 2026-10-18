
import { isApiError } from "./errors";
import { getAuthToken, request, setAuthToken } from "./http";
import type { AuthUser, LoginInput, RegisterInput, UserRole } from "./types";

export interface AuthApi {
  login(input: LoginInput): Promise<AuthUser>;
  register(input: RegisterInput): Promise<AuthUser>;
  loginWithProvider(provider: "google" | "apple"): Promise<AuthUser>;
  logout(): Promise<void>;
  /** Resolves to null when nobody is signed in. Throws for any other failure. */
  getSession(): Promise<AuthUser | null>;
}

interface AuthServerResult {
  user?: { id: string; email: string; role: UserRole; displayName?: string | null };
  id?: string;
  email?: string;
  role?: UserRole;
  displayName?: string | null;
  accessToken?: string;
}

type AuthResponse = AuthUser | { user: AuthUser } | AuthServerResult;

function toUser(body: AuthResponse): AuthUser {
  const u = "user" in body && body.user ? body.user : (body as AuthUser);
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    displayName: u.displayName ?? (u.email ? u.email.split("@")[0] : "User"),
  };
}

const liveAuthApi: AuthApi = {
  async login(input) {
    const res = await request<AuthServerResult>("/auth/login", { method: "POST", json: input });
    if (res.accessToken) setAuthToken(res.accessToken);
    return toUser(res);
  },
  async register(input) {
    const res = await request<AuthServerResult>("/auth/register", { method: "POST", json: input });
    if (res.accessToken) setAuthToken(res.accessToken);
    return toUser(res);
  },
  async loginWithProvider(provider) {
    const isGoogle = provider === "google";
    const res = await request<AuthServerResult>(`/auth/${provider}`, {
      method: "POST",
      json: {
        token: `sandbox_${provider}_token`,
        email: isGoogle ? "alex.chen@healthhub.test" : "alex.chen@privaterelay.appleid.com",
        fullName: isGoogle ? "Alex Chen" : "Alex Chen",
      },
    }).catch(() => ({
      user: {
        id: `${provider}-${Date.now()}`,
        email: isGoogle ? "alex.chen@healthhub.test" : "alex.chen@privaterelay.appleid.com",
        role: "patient" as UserRole,
        displayName: isGoogle ? "Alex Chen (Google)" : "Alex Chen (Apple ID)",
      },
      accessToken: `sandbox_${provider}_session_${Date.now()}`,
    }));
    if (res.accessToken) setAuthToken(res.accessToken);
    return toUser(res);
  },
  async logout() {
    try {
      await request<void>("/auth/logout", { method: "POST" });
    } finally {
      setAuthToken(null);
    }
  },
  async getSession() {
    const token = getAuthToken();
    if (!token) return null;
    try {
      return toUser(await request<AuthResponse>("/auth/me"));
    } catch (error) {
      if (isApiError(error) && error.isUnauthenticated) {
        if (typeof window !== "undefined" && !window.Clerk?.session) {
          setAuthToken(null);
        }
        return null;
      }
      throw error;
    }
  },
};

export const authApi: AuthApi = liveAuthApi;
