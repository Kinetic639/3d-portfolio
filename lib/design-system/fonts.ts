import localFont from "next/font/local";

/*
 * Self-hosted (fonts/, from Fontsource, SIL Open Font License) rather than
 * next/font/google: Turbopack's Google font loader fails the build when Google
 * serves font files at extensionless URLs (vercel/next.js#99114), and a
 * build should not depend on a third-party response anyway.
 */

/** Display/label typeface for the dark UI concept ("DISPLAY" / "UI-LABEL" in the reference). */
export const spaceGrotesk = localFont({
  src: [
    { path: "./fonts/space-grotesk-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/space-grotesk-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--dsd-font-display",
  display: "swap",
});

/** Body typeface for the dark UI concept ("BODY" in the reference). */
export const inter = localFont({
  src: [
    { path: "./fonts/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--dsd-font-body",
  display: "swap",
});
