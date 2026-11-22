import type { Metadata } from "next";
import SiteShell from "@/components/site/SiteShell";
import { messages } from "@/lib/i18n/messages";

export const metadata: Metadata = {
  title: messages("en").meta.title,
  description: messages("en").meta.description,
};

/** Root layout of the English site (the bare paths: /, /projects...). The Polish one is app/(pl)/layout.tsx. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell locale="en">{children}</SiteShell>;
}
