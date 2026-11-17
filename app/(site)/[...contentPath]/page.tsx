import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LandingPage from "@/components/site/LandingPage";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { CONTENT_SECTIONS, findContentByPath, getContentPath } from "@/lib/content/content";
import { findSectionByPath, getSectionPath } from "@/lib/content/places";

type Params = { contentPath: string[] };

// Every content item and every list section has exactly one URL; anything else under this route is a 404.
export const dynamicParams = false;

const segments = (path: string) => path.split("/").filter(Boolean);

export function generateStaticParams(): Params[] {
  return [
    ...PORTFOLIO_CONTENT.items.map((item) => ({ contentPath: segments(getContentPath(item)) })),
    ...CONTENT_SECTIONS.filter((section) => !section.singleton).map((section) => ({ contentPath: segments(getSectionPath(section)) })),
  ];
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { contentPath } = await params;
  const path = `/${contentPath.join("/")}`;
  const section = findSectionByPath(path);
  if (section) return { title: `${section.label} - ${PORTFOLIO_CONTENT.owner.name}` };
  const item = findContentByPath(PORTFOLIO_CONTENT, path);
  if (!item) return {};
  return {
    title: `${item.title} - ${PORTFOLIO_CONTENT.owner.name}`,
    description: item.summary,
  };
}

/**
 * An item's own page, or a section's (/projects): the landing page with that
 * item or section first. Entering the world from here goes straight to it
 * (a section is a zone: the camera flies to it).
 */
export default async function ContentPage({ params }: { params: Promise<Params> }) {
  const { contentPath } = await params;
  const path = `/${contentPath.join("/")}`;
  const section = findSectionByPath(path);
  if (section) return <LandingPage featuredSection={section} />;
  const item = findContentByPath(PORTFOLIO_CONTENT, path);
  if (!item) notFound();
  return <LandingPage featured={item} />;
}
