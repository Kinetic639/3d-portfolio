import "@/app/globals.css";
import { THEME_BOOT_SCRIPT } from "./theme-boot";

/**
 * The document every root layout renders: the site has one root layout per
 * language (app/(site) for English, app/(pl) for Polish) and one for the
 * development tools, so each page's <html lang> is right in the HTML the
 * server sends. Moving between them is a full page load, which only a
 * language switch does.
 */
export default function RootDocument({ lang, children }: { lang: string; children: React.ReactNode }) {
  return (
    // The theme attribute is set by the boot script before React hydrates.
    <html lang={lang} className="h-full antialiased" data-scroll-behavior="smooth" suppressHydrationWarning>
      {/* The root layouts render this document, so this is the App Router <head>, not the Pages Router one the rule is about. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {/* Without JavaScript there is no world, so no door to it: the page is the whole site. */}
        <noscript><style>{"[data-world-door]{display:none}@media (max-width:760px){[data-door-bar]{display:none}#landing{padding-bottom:0}}"}</style></noscript>
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
