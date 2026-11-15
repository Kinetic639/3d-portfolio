import { notFound } from "next/navigation";
import WorldView from "@/components/world/WorldView";
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
      <WorldView mapId={mapId} />
    </main>
  );
}
