import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LandingPage from "@/components/site/LandingPage";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { findContentByPath, getContentPath } from "@/lib/content/content";

type Params = { contentPath: string[] };

// Every content item has exactly one URL; anything else under this route is a 404.
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return PORTFOLIO_CONTENT.items.map((item) => ({ contentPath: getContentPath(item).split("/").filter(Boolean) }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { contentPath } = await params;
  const item = findContentByPath(PORTFOLIO_CONTENT, `/${contentPath.join("/")}`);
  if (!item) return {};
  return {
    title: `${item.title} - ${PORTFOLIO_CONTENT.owner.name}`,
    description: item.summary,
  };
}

/** An item's own page: the landing page with that item first. Entering the world from here goes straight to it. */
export default async function ContentPage({ params }: { params: Promise<Params> }) {
  const { contentPath } = await params;
  const item = findContentByPath(PORTFOLIO_CONTENT, `/${contentPath.join("/")}`);
  if (!item) notFound();
  return <LandingPage featured={item} />;
}
