import WorldLayer from "@/components/world/WorldLayer";
import { listFreshBakes } from "@/lib/bake/bake-records";
import { readMapIndex } from "@/lib/maps/map-store";

/**
 * Whether visitors get a map's bake (when it is fresh) instead of its voxels:
 * SERVE_BAKED_WORLDS=1 in the build environment. Off until the bake has been
 * checked against the voxels and approved; development builds load the bake
 * with ?world=baked either way.
 */
const SERVE_BAKED_WORLDS = process.env.SERVE_BAKED_WORLDS === "1";

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
      <WorldLayer defaultMapId={defaultMapId} bakes={listFreshBakes()} serveBakes={SERVE_BAKED_WORLDS} />
    </>
  );
}
