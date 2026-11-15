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
      <WorldLayer defaultMapId={defaultMapId} />
    </>
  );
}
