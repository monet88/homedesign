"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import type { Language, Dictionary, LanguageOption } from "./types";
import { SUPPORTED_LANGUAGES } from "./types";
import { en } from "./dictionaries/en";
import { vi } from "./dictionaries/vi";
import { ja } from "./dictionaries/ja";
import { ko } from "./dictionaries/ko";
import { zh } from "./dictionaries/zh";

const DICTIONARIES: Record<Language, Dictionary> = {
  en,
  vi,
  ja,
  ko,
  zh,
};

interface LanguageContextType {
  lang: Language;
  setLanguage: (newLang: Language) => void;
  t: Dictionary;
  languages: LanguageOption[];
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "en",
  setLanguage: () => {},
  t: en,
  languages: SUPPORTED_LANGUAGES,
});

const STORAGE_KEY = "hd_lang";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (saved && DICTIONARIES[saved]) {
        setLangState(saved);
        return;
      }

      // Default language is English (en)
      setLangState("en");
    } catch {
      // Storage access disabled or restricted
    }
  }, []);

  const setLanguage = (newLang: Language) => {
    if (!DICTIONARIES[newLang]) return;
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
      document.cookie = `hd_lang=${newLang}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // Storage write error non-fatal
    }
  };

  const t = useMemo(() => DICTIONARIES[lang] || en, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLanguage,
      t,
      languages: SUPPORTED_LANGUAGES,
    }),
    [lang, t]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useTranslation() {
  const { t, lang, setLanguage } = useContext(LanguageContext);
  return { t, lang, setLanguage };
}
