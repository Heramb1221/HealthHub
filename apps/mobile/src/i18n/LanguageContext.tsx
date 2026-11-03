import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";

import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from "./languages";
import { translate, type TranslationParams } from "./translate";

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

/**
 * Stored with the other device preferences (reminder flags use SecureStore too), so the
 * choice survives app restarts the same way on web and mobile.
 */
export const LANGUAGE_PREFERENCE_KEY = "sehatmeds.language";

async function readSavedLanguage(): Promise<SupportedLanguage | null> {
  try {
    const stored = await SecureStore.getItemAsync(LANGUAGE_PREFERENCE_KEY);
    return isSupportedLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

async function saveLanguage(lang: SupportedLanguage): Promise<void> {
  try {
    await SecureStore.setItemAsync(LANGUAGE_PREFERENCE_KEY, lang);
  } catch {
    // Best-effort: the language still applies for this session.
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);

  useEffect(() => {
    let active = true;
    void readSavedLanguage().then((saved) => {
      if (active && saved) setLanguageState(saved);
    });
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    if (!isSupportedLanguage(lang)) return;
    setLanguageState(lang);
    void saveLanguage(lang);
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
