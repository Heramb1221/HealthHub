
import { isApiError } from "./errors";
import { request } from "./http";
import type { AuthUser, LoginInput, RegisterInput } from "./types";

export interface AuthApi {
  login(input: LoginInput): Promise<AuthUser>;
  register(input: RegisterInput): Promise<AuthUser>;
  logout(): Promise<void>;
  /** Resolves to null when nobody is signed in. Throws for any other failure. */
  getSession(): Promise<AuthUser | null>;
}

type AuthResponse = AuthUser | { user: AuthUser };

function toUser(body: AuthResponse): AuthUser {
  return "user" in body ? body.user : body;
}

const liveAuthApi: AuthApi = {
  async login(input) {
    return toUser(await request<AuthResponse>("/auth/login", { method: "POST", json: input }));
  },
  async register(input) {
    return toUser(await request<AuthResponse>("/auth/register", { method: "POST", json: input }));
  },
  async logout() {
    await request<void>("/auth/logout", { method: "POST" });
  },
  async getSession() {
    try {
      return toUser(await request<AuthResponse>("/auth/me"));
    } catch (error) {
      if (isApiError(error) && error.isUnauthenticated) return null;
      throw error;
    }
  },
};

export const authApi: AuthApi =
  process.env.NEXT_PUBLIC_API_MODE === "live"
    ? liveAuthApi
    : // Required only in demo builds, so demo accounts and sample data never ship in a live bundle (see README).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@/lib/demo/auth") as typeof import("@/lib/demo/auth")).demoAuthApi;
