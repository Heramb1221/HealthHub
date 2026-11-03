
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { AuthUser } from "../api/types";

const KEY = "healthhub.session.v1";

export interface StoredSession {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return typeof localStorage !== "undefined"
      ? localStorage.getItem(key)
      : null;
  }

  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await getItem(KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredSession>;

    if (
      !parsed.accessToken ||
      !parsed.expiresAt ||
      !parsed.user?.id
    ) {
      return null;
    }

    return parsed as StoredSession;
  } catch (error) {
    console.error("[AUTH] Failed to load stored session:", error);
    return null;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  await setItem(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  try {
    await removeItem(KEY);
  } catch (error) {
    console.error("[AUTH] Failed to clear stored session:", error);
  }
}
