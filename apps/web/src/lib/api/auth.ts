import { demoAuthApi } from "@/lib/demo/auth";

import { isApiError } from "./errors";
import { request } from "./http";
import { pick } from "./mode";
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

export const authApi: AuthApi = pick(liveAuthApi, demoAuthApi);
