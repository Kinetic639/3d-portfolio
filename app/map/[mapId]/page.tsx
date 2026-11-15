import { notFound } from "next/navigation";
import WorldExperience from "@/components/world/WorldExperience";
import { listMapIds, mapExists } from "@/lib/maps/map-store";

// Only maps that exist in the repository at build time are reachable.
export const dynamicParams = false;

export function generateStaticParams() {
  return listMapIds().map((mapId) => ({ mapId }));
}

export default async function MapPage({ params }: { params: Promise<{ mapId: string }> }) {
  const { mapId } = await params;
  if (!mapExists(mapId)) notFound();

  return (
    <main>
      <WorldExperience mapId={mapId} worldPath={`/map/${mapId}`} />
    </main>
  );
}
