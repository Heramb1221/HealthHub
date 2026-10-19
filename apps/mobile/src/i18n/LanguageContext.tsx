import React, { createContext, useContext, useState } from "react";
import { MOBILE_DICTIONARY, type SupportedLanguage } from "./languages";

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  t: (key, fallback) => fallback || key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<SupportedLanguage>("en");

  const t = (key: string, fallback?: string): string => {
    const dict = MOBILE_DICTIONARY[language] || MOBILE_DICTIONARY.en;
    if (dict[key]) return dict[key];
    const enDict = MOBILE_DICTIONARY.en;
    if (enDict[key]) return enDict[key];
    return fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
