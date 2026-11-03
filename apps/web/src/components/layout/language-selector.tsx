"use client";

import React from "react";
import { Globe } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import { LOCALE_TAGS, SUPPORTED_LANGUAGES, isSupportedLanguage } from "@/lib/i18n/languages";

export function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      className="relative inline-flex items-center rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1"
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-300 bg-white hover:bg-slate-50 transition-colors shadow-sm">
        <Globe className="size-3.5 text-primary shrink-0" aria-hidden="true" />
        <select
          value={language}
          onChange={(e) => {
            const next = e.target.value;
            if (isSupportedLanguage(next)) setLanguage(next);
          }}
          aria-label={t("select_language", "Select Regional Language")}
          className="bg-transparent font-semibold text-slate-800 text-xs focus:outline-none cursor-pointer pr-1 max-w-[4.75rem] truncate sm:max-w-none"
        >
          {SUPPORTED_LANGUAGES.map((item) => (
            // The lang attribute lets screen readers pronounce each native name correctly.
            <option key={item.code} value={item.code} lang={LOCALE_TAGS[item.code]} className="text-sm py-1 font-medium">
              {item.nativeName} ({item.name})
            </option>
          ))}
        </select>
        <span className="hidden sm:inline text-[9px] bg-sky-100 text-sky-800 font-bold px-1 py-0.5 rounded ml-0.5 shrink-0">
          BHASHINI
        </span>
      </div>
    </div>
  );
}
