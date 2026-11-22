/**
 * The site's languages and their URLs (docs/roadmap.md, B1). English is the
 * main language and keeps the bare paths (/, /projects/...); every other
 * language lives under its own prefix (/pl, /pl/projects/...). Path segments
 * are the same in every language, so switching only adds or removes the prefix.
 */
export const LOCALES = ["en", "pl"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Each language's name in itself, for the switch. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", pl: "Polski" };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function localePrefix(locale: Locale) {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

/** A path of the site (always as in English: "/", "/projects", "/#contact") in a language. */
export function localizePath(path: string, locale: Locale) {
  const prefix = localePrefix(locale);
  if (!prefix) return path;
  if (path === "/") return prefix;
  return path.startsWith("/#") ? `${prefix}${path.slice(1)}` : `${prefix}${path}`;
}

/** The language of a URL path and the path without its prefix ("/pl/projects" is Polish "/projects"). */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  for (const locale of LOCALES) {
    const prefix = localePrefix(locale);
    if (!prefix) continue;
    if (pathname === prefix) return { locale, path: "/" };
    if (pathname.startsWith(`${prefix}/`)) return { locale, path: pathname.slice(prefix.length) };
  }
  return { locale: DEFAULT_LOCALE, path: pathname };
}

/** Where the browser keeps a language the visitor chose (with the switch, or answering the first-visit question). */
export const LOCALE_CHOICE_KEY = "lang-choice";

/**
 * The language a visitor's browser asks for, among the site's, or null when it
 * asks for none of them. Only the first matching entry counts: "de, pl" is Polish.
 */
export function preferredLocale(languages: readonly string[]): Locale | null {
  for (const language of languages) {
    const base = language.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return null;
}
