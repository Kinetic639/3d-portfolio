"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme } from "./theme";
import { messages } from "@/lib/i18n/messages";
import { useLocale } from "./locale-context";
import styles from "./ThemeToggle.module.css";

/**
 * Day and night: a switch with the sun on one side and the moon on the
 * other. The same control sits in the page's header and beside the world's
 * map; both read and set the one theme on <html>.
 */
export default function ThemeToggle({ className }: { className?: string }) {
  // The server renders day; the inline boot script may already have set night.
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "light" as const);
  const dark = theme === "dark";
  const text = messages(useLocale()).theme;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={text.night}
      title={dark ? text.toDay : text.toNight}
      className={className ? `${styles.toggle} ${className}` : styles.toggle}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <Sun aria-hidden="true" size={14} className={styles.sun} />
      <Moon aria-hidden="true" size={14} className={styles.moon} />
      <span className={styles.knob} aria-hidden="true">
        {dark ? <Moon size={14} /> : <Sun size={14} />}
      </span>
    </button>
  );
}
