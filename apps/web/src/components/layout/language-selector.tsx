"use client";

import React from "react";
import { Globe } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/lib/i18n/languages";

export function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="relative inline-flex items-center">
      <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-300 bg-white hover:bg-slate-50 transition-colors shadow-sm">
        <Globe className="size-3.5 text-primary shrink-0" aria-hidden="true" />
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
          aria-label={t("select_language", "Select Regional Language")}
          className="bg-transparent font-semibold text-slate-800 text-xs focus:outline-none cursor-pointer pr-1"
        >
          {SUPPORTED_LANGUAGES.map((item) => (
            <option key={item.code} value={item.code} className="text-sm py-1 font-medium">
              {item.flag} {item.nativeName} ({item.name})
            </option>
          ))}
        </select>
        <span className="text-[9px] bg-sky-100 text-sky-800 font-bold px-1 py-0.5 rounded ml-0.5 shrink-0">
          BHASHINI
        </span>
      </div>
    </div>
  );
}
