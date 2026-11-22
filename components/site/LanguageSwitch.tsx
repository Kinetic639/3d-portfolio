"use client";

import { usePathname } from "next/navigation";
import { LOCALE_NAMES, LOCALES } from "@/lib/i18n/locale";
import { messages } from "@/lib/i18n/messages";
import { pathInLocale, rememberLocaleChoice } from "./language-choice";
import { useLocale } from "./locale-context";
import styles from "./LanguageSwitch.module.css";

/**
 * EN | PL in the page's bar: plain links to the same page in each language,
 * so they work without JavaScript. Following one remembers the choice, and
 * the first-visit question is not asked again.
 */
export default function LanguageSwitch() {
  const locale = useLocale();
  // The URL the visitor is on, including one the world pushed (an item opened there).
  const pathname = usePathname();
  return (
    <nav className={styles.switch} aria-label={messages(locale).language.label}>
      {LOCALES.map((candidate) => (
        <a
          key={candidate}
          href={pathInLocale(pathname, candidate)}
          hrefLang={candidate}
          lang={candidate}
          aria-current={candidate === locale ? "page" : undefined}
          onClick={() => rememberLocaleChoice(candidate)}
        >
          {/* The name starts with what is on screen (EN), so voice control finds it; the language's full name follows for screen readers. */}
          {candidate.toUpperCase()}<span className={styles.srOnly}> {LOCALE_NAMES[candidate]}</span>
        </a>
      ))}
    </nav>
  );
}
