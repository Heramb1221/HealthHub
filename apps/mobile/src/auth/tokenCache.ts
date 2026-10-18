import * as SecureStore from "expo-secure-store";
import type { TokenCache } from "@clerk/expo";

export const tokenCache: TokenCache = {
  async getToken(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, token);
    } catch {
      // Ignore secure store write failures
    }
  },
  async clearToken(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore secure store delete failures
    }
  },
};
