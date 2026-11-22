import type { Metadata } from "next";
import SiteShell from "@/components/site/SiteShell";
import { messages } from "@/lib/i18n/messages";
import { siteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  // Canonical and hreflang URLs are absolute against this.
  metadataBase: siteUrl(),
  title: messages("en").meta.title,
  description: messages("en").meta.description,
};

/** Root layout of the English site (the bare paths: /, /projects...). The Polish one is app/(pl)/layout.tsx. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell locale="en">{children}</SiteShell>;
}
