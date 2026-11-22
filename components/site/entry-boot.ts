import { LOCALES, localizePath } from "@/lib/i18n/locale";

/**
 * Who gets the entry screen with the door (docs/roadmap.md, B4), decided in
 * <head> before the page is painted, so the page never flashes before it.
 *
 * Shown on a language's home page (/ and /pl) to a wide screen with a fine
 * pointer that has not chosen the classic version before. Not shown to:
 * phones and touch screens, visitors who prefer reduced motion or save data
 * (they get the classic page, with its own way into the world), links to
 * anything else (/projects/...), and browsers without JavaScript (the script
 * does not run). Without WebGL the screen closes itself once the world
 * reports it cannot start.
 *
 * `?entry=door` shows it regardless, `?entry=classic` never; the choice of
 * the classic version is kept in the browser.
 *
 * The decision is written as `data-entry-screen` on <html>; the entry screen
 * (EntryScreen) opens on it and removes it when it closes.
 */
export const ENTRY_CHOICE_KEY = "entry-choice";
export const ENTRY_PARAM = "entry";

const homes = LOCALES.map((locale) => localizePath("/", locale));

export const ENTRY_BOOT_SCRIPT = `try{var h=${JSON.stringify(homes)},p=location.pathname.replace(/\\/$/,"")||"/",q=new URLSearchParams(location.search).get("${ENTRY_PARAM}"),c=navigator.connection;if(q==="door"||(q!=="classic"&&h.indexOf(p)>=0&&localStorage.getItem("${ENTRY_CHOICE_KEY}")!=="classic"&&!matchMedia("(max-width: 760px), (pointer: coarse), (prefers-reduced-motion: reduce)").matches&&!(c&&c.saveData)))document.documentElement.dataset.entryScreen=""}catch(e){}`;
