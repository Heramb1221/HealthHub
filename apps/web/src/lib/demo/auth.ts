import { ApiError } from "@/lib/api/errors";
import type { AuthApi } from "@/lib/api/auth";
import type { AuthUser } from "@/lib/api/types";

/**
 * DEMO ONLY. Replaces the Express auth endpoints when NEXT_PUBLIC_API_MODE=demo.
 *
 * - Two seeded synthetic accounts, with credentials shown on the sign-in screen.
 * - Signing up creates a demo session without storing any password.
 * - The session is kept in localStorage of this browser. It grants nothing real.
 */
export const DEMO_ACCOUNTS = [
  { id: "demo-patient", email: "demo.patient@healthhub.test", password: "DemoPatient#1", role: "patient", displayName: "Demo Patient" },
  { id: "demo-admin", email: "demo.admin@healthhub.test", password: "DemoAdmin#1", role: "admin", displayName: "Demo Admin" },
] as const;

const STORAGE_KEY = "healthhub-demo-session";

function read(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function write(user: AuthUser | null) {
  try {
    if (user) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    throw new ApiError({ code: "DEMO_UNSUPPORTED", message: "Demo mode needs browser storage, which is blocked in this browser.", status: 0 });
  }
}

export const demoAuthApi: AuthApi = {
  async login({ email, password }) {
    const account = DEMO_ACCOUNTS.find((a) => a.email === email.trim().toLowerCase() && a.password === password);
    if (!account) {
      throw new ApiError({ code: "INVALID_CREDENTIALS", message: "Email or password is incorrect. In demo mode, use one of the demo accounts shown below.", status: 401 });
    }
    const user: AuthUser = { id: account.id, email: account.email, role: account.role, displayName: account.displayName };
    write(user);
    return user;
  },
  async register({ fullName, email }) {
    const normalised = email.trim().toLowerCase();
    if (DEMO_ACCOUNTS.some((a) => a.email === normalised)) {
      throw new ApiError({ code: "CONFLICT", message: "That email belongs to a demo account. Sign in instead.", status: 409 });
    }
    const user: AuthUser = { id: `demo-${crypto.randomUUID()}`, email: normalised, role: "patient", displayName: fullName.trim() };
    write(user);
    return user;
  },
  async logout() {
    write(null);
  },
  async getSession() {
    return read();
  },
};
