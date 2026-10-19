"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { DICTIONARY, lookupTranslation, SUPPORTED_LANGUAGES, type SupportedLanguage } from "./languages";

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

const STORAGE_KEY = "healthhub_preferred_language";
const originalTextMap = new WeakMap<Node, string>();

function translateTextNode(node: Node, lang: SupportedLanguage) {
  let original = originalTextMap.get(node);
  if (!original) {
    original = node.nodeValue || "";
    originalTextMap.set(node, original);
  }

  if (lang === "en") {
    if (node.nodeValue !== original) {
      node.nodeValue = original;
    }
    return;
  }

  const trimmed = original.trim();
  if (!trimmed) return;

  let translation = lookupTranslation(lang, trimmed);

  // If no direct exact match, perform phrase replacement across text nodes
  if (!translation) {
    const dict = DICTIONARY[lang];
    if (dict) {
      let replaced = original;
      const phrases = Object.keys(dict).filter((k) => k.length > 3 && !k.includes("_"));
      phrases.sort((a, b) => b.length - a.length);
      for (const phrase of phrases) {
        if (replaced.includes(phrase)) {
          replaced = replaced.replaceAll(phrase, dict[phrase]);
        }
      }
      if (replaced !== original) {
        translation = replaced;
      }
    }
  }

  if (translation) {
    const leading = original.match(/^\s*/)?.[0] || "";
    const trailing = original.match(/\s*$/)?.[0] || "";
    const nextVal = leading + translation.trim() + trailing;
    if (node.nodeValue !== nextVal) {
      node.nodeValue = nextVal;
    }
  }
}

function translateDomTree(root: Node, lang: SupportedLanguage) {
  if (typeof window === "undefined" || !root) return;

  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root, lang);
    return;
  }

  if (root.nodeType === Node.ELEMENT_NODE) {
    const el = root as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "code" || tag === "pre") {
      return;
    }

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.placeholder) {
        let orig = el.getAttribute("data-orig-placeholder");
        if (!orig) {
          orig = el.placeholder;
          el.setAttribute("data-orig-placeholder", orig);
        }
        if (lang === "en") {
          el.placeholder = orig;
        } else {
          const trans = lookupTranslation(lang, orig);
          if (trans) el.placeholder = trans;
        }
      }
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const parentTag = parent.tagName.toLowerCase();
          if (parentTag === "script" || parentTag === "style" || parentTag === "code" || parentTag === "pre") {
            return NodeFilter.FILTER_REJECT;
          }
          if (!node.nodeValue || !node.nodeValue.trim()) {
            return NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const nodes: Node[] = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    for (const textNode of nodes) {
      translateTextNode(textNode, lang);
    }
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    if (typeof window === "undefined") return "en";
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as SupportedLanguage | null;
      if (stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored)) {
        return stored;
      }
    } catch {
      // Local storage unavailable
    }
    return "en";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    document.documentElement.lang = language;
    translateDomTree(document.body, language);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        translateDomTree(document.body, language);
      }, 50);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [language]);

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore storage errors
    }
  };

  const t = (key: string, fallback?: string): string => {
    if (language === "en") return fallback || key;
    const translated = lookupTranslation(language, key);
    if (translated) return translated;
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
