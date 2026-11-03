"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_LANGUAGE, LOCALE_TAGS, isSupportedLanguage, type SupportedLanguage } from "./languages";
import { translate, type TranslationParams } from "./translate";
import { LANGUAGE_STORAGE_KEY, readStoredLanguage, writeStoredLanguage, type KeyValueStore } from "./storage";
import { TRANSLATABLE_ATTRIBUTES, translateDocumentTree } from "./dom-translation";

export interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  /**
   * Translate a UI string. `fallback` is the English text shown when the language has no entry.
   * `params` fills `{name}` placeholders, and `params.count` picks the plural form.
   */
  t: (key: string, fallback?: string, params?: TranslationParams) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key, fallback, params) => translate(DEFAULT_LANGUAGE, key, fallback, params),
});

function browserStorage(): KeyValueStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Accessing localStorage throws in some privacy modes and when site data is blocked.
    return null;
  }
}

// The language lives in a tiny external store, read through useSyncExternalStore. The server
// snapshot is English, so hydration matches the server HTML; the saved choice is applied on the
// client without a setState-in-effect.
type Listener = () => void;
const listeners = new Set<Listener>();
// Keeps the choice for this page even when storage is blocked or full.
let sessionLanguage: SupportedLanguage | null = null;

function getLanguageSnapshot(): SupportedLanguage {
  return sessionLanguage ?? readStoredLanguage(browserStorage()) ?? DEFAULT_LANGUAGE;
}

function getServerLanguageSnapshot(): SupportedLanguage {
  return DEFAULT_LANGUAGE;
}

function subscribeToLanguage(listener: Listener): () => void {
  listeners.add(listener);
  // Another tab changed the saved language.
  const onStorage = (event: StorageEvent) => {
    if (event.key === LANGUAGE_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useSyncExternalStore(subscribeToLanguage, getLanguageSnapshot, getServerLanguageSnapshot);

  useEffect(() => {
    if (typeof window === "undefined") return;

    document.documentElement.lang = LOCALE_TAGS[language];
    document.documentElement.dir = "ltr";

    let frame = 0;
    const run = () => {
      frame = 0;
      translateDocumentTree(document.body, language);
      // Discard the mutation records produced by our own writes, so they do not schedule another pass.
      observer.takeRecords();
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(run);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });
    run();

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [language]);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    if (!isSupportedLanguage(lang)) return;
    sessionLanguage = lang;
    writeStoredLanguage(browserStorage(), lang);
    listeners.forEach((listener) => listener());
  }, []);

  const t = useCallback(
    (key: string, fallback?: string, params?: TranslationParams) => translate(language, key, fallback, params),
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
