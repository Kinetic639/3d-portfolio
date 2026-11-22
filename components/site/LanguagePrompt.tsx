"use client";

import { useEffect, useState } from "react";
import { preferredLocale, type Locale } from "@/lib/i18n/locale";
import { messages } from "@/lib/i18n/messages";
import { pathInLocale, readLocaleChoice, rememberLocaleChoice } from "./language-choice";
import { useLocale } from "./locale-context";
import styles from "./LanguagePrompt.module.css";

/**
 * The first-visit question: when the browser asks for another of the site's
 * languages than the page's, and the visitor has never chosen, a small note
 * offers the page in that language, asked in that language. Either answer is
 * remembered. It floats over the page (nothing moves when it appears) and
 * never redirects on its own, so links and search engines always get the
 * page they asked for.
 */
export default function LanguagePrompt() {
  const locale = useLocale();
  const [offer, setOffer] = useState<Locale | null>(null);

  useEffect(() => {
    // Read after mount: the browser's languages and the stored choice are not known while rendering on the server.
    const timer = window.setTimeout(() => {
      if (readLocaleChoice()) return;
      // The entry screen (prototype) asks for the language itself.
      if (new URLSearchParams(window.location.search).get("entry") === "door") return;
      const wanted = preferredLocale(navigator.languages ?? [navigator.language]);
      if (wanted && wanted !== locale) setOffer(wanted);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [locale]);

  if (!offer) return null;
  const text = messages(offer).language;
  return (
    <aside className={styles.prompt} lang={offer} aria-label={text.label}>
      <p className={styles.question}>{text.question}</p>
      <p className={styles.actions}>
        <a
          className={styles.go}
          href={pathInLocale(window.location.pathname, offer)}
          hrefLang={offer}
          onClick={() => rememberLocaleChoice(offer)}
        >
          {text.go}
        </a>
        <button
          type="button"
          className={styles.stay}
          onClick={() => {
            rememberLocaleChoice(locale);
            setOffer(null);
          }}
        >
          {text.stay}
        </button>
      </p>
    </aside>
  );
}
