import WorldLayer from "@/components/world/WorldLayer";
import { readMapIndex } from "@/lib/maps/map-store";

/**
 * Layout for every page that belongs to the portfolio proper. The world layer
 * lives here, not in the pages, so moving between landing pages never
 * restarts the world that is loading (or already warm) behind them.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  // Read at build time: the default map is whatever maps/index.json names in the deployed commit.
  const { defaultMapId } = readMapIndex();

  return (
    <>
      {children}
      {/*
        Visitors get the voxel world. Baked worlds are switched off here until the
        bake keeps the terrain's shapes and textures; to use them again, pass
        listFreshBakes() from lib/bake/bake-records.
      */}
      <WorldLayer defaultMapId={defaultMapId} bakes={{}} />
    </>
  );
}
