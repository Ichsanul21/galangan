// Konteks bahasa + hook useT(). Default "id", persist isms.locale.
// Status DATA tidak diterjemahkan nilainya — pakai status.ts (label saja).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Dict, Locale } from "./types";
import { id } from "./id";
import { en } from "./en";

const LOCALE_KEY = "isms.locale";
const DICTS: Record<Locale, Dict> = { id, en };

function loadLocale(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    return v === "en" ? "en" : "id";
  } catch {
    return "id";
  }
}

interface LangCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Dict;
}

const Ctx = createContext<LangCtx>({ locale: "id", setLocale: () => undefined, t: id });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => loadLocale());
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(LOCALE_KEY, l);
    } catch {
      /* abaikan */
    }
  }, []);
  useEffect(() => {
    try {
      document.documentElement.lang = locale === "en" ? "en" : "id";
    } catch {
      /* abaikan */
    }
  }, [locale]);
  return <Ctx.Provider value={{ locale, setLocale, t: DICTS[locale] }}>{children}</Ctx.Provider>;
}

export function useT(): LangCtx {
  return useContext(Ctx);
}
