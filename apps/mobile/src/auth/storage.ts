import * as SecureStore from "expo-secure-store";

import type { AuthUser } from "../api/types";

const KEY = "healthhub.session.v1";

export interface StoredSession {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.accessToken || !parsed.expiresAt || !parsed.user?.id) return null;
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {

  }
}
