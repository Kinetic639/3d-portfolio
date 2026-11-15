import WorldExperience from "@/components/world/WorldExperience";
import { readMapIndex } from "@/lib/maps/map-store";

export default function Home() {
  // Read at build time: the default map is whatever maps/index.json names in the deployed commit.
  const { defaultMapId } = readMapIndex();

  return (
    <main>
      <WorldExperience mapId={defaultMapId} worldPath="/" />
    </main>
  );
}
