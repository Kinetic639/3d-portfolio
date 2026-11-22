import type { Metadata } from "next";
import RootDocument from "@/components/site/RootDocument";

export const metadata: Metadata = {
  title: "Michał Stępień - Tools",
  robots: { index: false },
};

/** Root layout of the development tools (the map editor, the design system): English, no world. */
export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return <RootDocument lang="en">{children}</RootDocument>;
}
