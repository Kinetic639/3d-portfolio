"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * The page's language for client components. Each language has its own root
 * layout, which sets it once: switching language loads the other layout.
 */
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
