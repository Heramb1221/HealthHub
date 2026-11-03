import { isSupportedLanguage, type SupportedLanguage } from "./languages";

/** Same key as before, so a language chosen earlier is still remembered. */
export const LANGUAGE_STORAGE_KEY = "healthhub_preferred_language";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Returns the saved language, or null when nothing valid is stored or storage is unavailable. */
export function readStoredLanguage(store: KeyValueStore | null | undefined): SupportedLanguage | null {
  if (!store) return null;
  try {
    const stored = store.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Returns false when storage is blocked or full. The choice then lasts for this page only. */
export function writeStoredLanguage(store: KeyValueStore | null | undefined, lang: SupportedLanguage): boolean {
  if (!store) return false;
  try {
    store.setItem(LANGUAGE_STORAGE_KEY, lang);
    return true;
  } catch {
    return false;
  }
}
