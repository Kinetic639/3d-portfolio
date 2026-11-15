import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WorldExperience from "@/components/world/WorldExperience";
import { PORTFOLIO_CONTENT } from "@/content/portfolio";
import { findContentByPath, getContentPath } from "@/lib/content/content";
import { readMapIndex } from "@/lib/maps/map-store";

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

export default async function ContentPage({ params }: { params: Promise<Params> }) {
  const { contentPath } = await params;
  if (!findContentByPath(PORTFOLIO_CONTENT, `/${contentPath.join("/")}`)) notFound();

  // Same shell as the home page: the open item comes from the URL, so the
  // content is in the server-rendered HTML and the world focuses it once ready.
  return (
    <main>
      <WorldExperience mapId={readMapIndex().defaultMapId} worldPath="/" />
    </main>
  );
}
