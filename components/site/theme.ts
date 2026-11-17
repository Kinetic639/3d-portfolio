"use client";

import { THEME_KEY } from "./theme-boot";

/**
 * The site's theme: "light" (day) or "dark" (night). Day unless the visitor
 * chose night before (kept in the browser). The attribute on <html> is the
 * source of truth: an inline script in the root layout sets it before the
 * first paint, so a returning night visitor never sees a flash of day.
 */
export type Theme = "light" | "dark";

const KEY = THEME_KEY;
const EVENT = "themechange";
/** How long the page's colours take to change; matches the world's day and night switch. */
export const THEME_SWITCH_MS = 2000;

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  const root = document.documentElement;
  if (getTheme() === theme) return;
  // The page's colours ease over while the world plays its sunset or sunrise.
  root.dataset.themeSwitching = "";
  window.setTimeout(() => delete root.dataset.themeSwitching, THEME_SWITCH_MS);
  if (theme === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private mode or blocked storage: the theme still changes for this visit.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeTheme(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
