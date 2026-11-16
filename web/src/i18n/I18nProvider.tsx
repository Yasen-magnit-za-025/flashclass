import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { UI_LOCALES, type UiLocale } from "@/domain/taxonomy";
import { catalogs, interpolate, type MessageKey, type PluralKey } from "./messages";

const STORAGE_KEY = "flashclass.locale";

interface I18nContextValue {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** Plural-aware lookup using `${key}.one` / `${key}.other`; `{count}` is interpolated. */
  tn: (key: PluralKey, count: number, vars?: Record<string, string | number>) => string;
  formatDate: (iso: string | null | undefined) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function initialLocale(): UiLocale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (UI_LOCALES as readonly string[]).includes(stored)) return stored as UiLocale;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "bg";
}

const intlLocale = (locale: UiLocale) => (locale === "bg" ? "bg-BG" : "en-GB");

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>(initialLocale);

  const setLocale = useCallback((next: UiLocale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const messages = catalogs[locale];
    const plural = new Intl.PluralRules(intlLocale(locale));
    const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" });
    const t: I18nContextValue["t"] = (key, vars) => interpolate(messages[key] ?? key, vars);
    return {
      locale,
      setLocale,
      t,
      tn: (key, count, vars) => {
        const form = plural.select(count) === "one" ? "one" : "other";
        return t(`${key}.${form}` as MessageKey, { count, ...vars });
      },
      formatDate: (iso) => (iso ? dateFormat.format(new Date(iso)) : ""),
      formatNumber: (value, options) => new Intl.NumberFormat(intlLocale(locale), options).format(value),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
