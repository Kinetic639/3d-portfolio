"use client";

import { portfolioContent } from "@/content/localized";
import { findContentByPath } from "@/lib/content/content";
import { findSectionByPath } from "@/lib/content/places";
import { LOCALE_CHOICE_KEY, localizePath, splitLocale, type Locale } from "@/lib/i18n/locale";

/** The language the visitor chose before, if any (kept in the browser, like the theme). */
export function readLocaleChoice(): string | null {
  try {
    return localStorage.getItem(LOCALE_CHOICE_KEY);
  } catch {
    return null;
  }
}

export function rememberLocaleChoice(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_CHOICE_KEY, locale);
  } catch {
    // Private mode or blocked storage: the choice holds for this page only.
  }
}

/**
 * The page at `pathname` in another language: the same item or section when
 * it has one there (every page of the portfolio does), the home page otherwise
 * (a map preview exists only in English).
 */
export function pathInLocale(pathname: string, target: Locale) {
  const { locale, path } = splitLocale(pathname);
  const exists = path === "/" || findSectionByPath(path) !== null || findContentByPath(portfolioContent(locale), path) !== null;
  return localizePath(exists ? path : "/", target);
}
