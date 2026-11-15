import { notFound } from "next/navigation";
import LandingPage from "@/components/site/LandingPage";
import { listMapIds, mapExists } from "@/lib/maps/map-store";

// Only maps that exist in the repository at build time are reachable.
export const dynamicParams = false;

export function generateStaticParams() {
  return listMapIds().map((mapId) => ({ mapId }));
}

/** Preview of a non-default map: the same landing page, with that map's world behind it. */
export default async function MapPage({ params }: { params: Promise<{ mapId: string }> }) {
  const { mapId } = await params;
  if (!mapExists(mapId)) notFound();
  return <LandingPage />;
}
