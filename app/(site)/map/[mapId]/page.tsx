import { notFound } from "next/navigation";
import LandingPage from "@/components/site/LandingPage";
import { listMapIds, mapExists } from "@/lib/maps/map-store";
import { readMinimapData } from "@/lib/minimap/minimap-store";

// Maps in the repository at build time are prerendered. Any other id is
// checked on request: a map created in the editor since then opens, an
// unknown one is a 404.
export function generateStaticParams() {
  return listMapIds().map((mapId) => ({ mapId }));
}

/** Preview of a non-default map: the same landing page, with that map's world behind it. */
export default async function MapPage({ params }: { params: Promise<{ mapId: string }> }) {
  const { mapId } = await params;
  if (!mapExists(mapId)) notFound();
  return <LandingPage minimap={readMinimapData(mapId)} />;
}
