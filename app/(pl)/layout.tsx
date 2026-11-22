import type { Metadata } from "next";
import SiteShell from "@/components/site/SiteShell";
import { messages } from "@/lib/i18n/messages";
import { siteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  // Canonical and hreflang URLs are absolute against this.
  metadataBase: siteUrl(),
  title: messages("pl").meta.title,
  description: messages("pl").meta.description,
};

/** Root layout of the Polish site, under /pl. The same pages as the English one (app/(site)), in Polish. */
export default function PolishLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell locale="pl">{children}</SiteShell>;
}
