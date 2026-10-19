"use client";

import React, { useState, useRef, useEffect } from "react";
import { Languages, Check, Globe } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/lib/i18n/languages";
import { Button } from "@/components/ui/button";

export function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeLang = SUPPORTED_LANGUAGES.find((l) => l.code === language) || SUPPORTED_LANGUAGES[0];

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border-slate-200 hover:bg-slate-50 transition-colors"
        aria-label={t("select_language", "Select Regional Language")}
        title="Bhashini AI Language Translation"
      >
        <Globe className="size-3.5 text-primary" aria-hidden="true" />
        <span className="font-semibold">{activeLang.nativeName}</span>
        <span className="text-[10px] text-muted-foreground uppercase">{activeLang.code}</span>
      </Button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-52 rounded-md bg-white p-1 shadow-lg ring-1 ring-black/5 z-50 focus:outline-none animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1.5 border-b text-[11px] font-semibold text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Languages className="size-3 text-primary" />
              Bhashini Regional Language
            </span>
            <span className="text-[9px] bg-sky-100 text-sky-800 px-1 rounded font-bold">Govt AI</span>
          </div>
          <div className="py-1">
            {SUPPORTED_LANGUAGES.map((item) => {
              const isSelected = item.code === language;
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    setLanguage(item.code as SupportedLanguage);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded transition-colors text-left ${
                    isSelected ? "bg-primary/10 text-primary font-bold" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{item.flag}</span>
                    <div>
                      <span className="block font-medium leading-none">{item.nativeName}</span>
                      <span className="text-[10px] text-muted-foreground">{item.name}</span>
                    </div>
                  </div>
                  {isSelected && <Check className="size-3.5 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
