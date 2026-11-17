/** Where the chosen theme is kept in the browser. */
export const THEME_KEY = "theme";

/**
 * Runs in <head> before the body is painted, so a returning night visitor
 * never sees a flash of day. Kept tiny and dependency-free.
 */
export const THEME_BOOT_SCRIPT = `try{if(localStorage.getItem("${THEME_KEY}")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;
