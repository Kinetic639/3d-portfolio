import WorldLayer from "@/components/world/WorldLayer";
import { listFreshBakes } from "@/lib/bake/bake-records";
import type { Locale } from "@/lib/i18n/locale";
import { readMapIndex } from "@/lib/maps/map-store";
import { readAllMinimaps } from "@/lib/minimap/minimap-store";
import { LocaleProvider } from "./locale-context";
import RootDocument from "./RootDocument";

/**
 * Whether visitors get a map's bake (when it is fresh) instead of its voxels:
 * SERVE_BAKED_WORLDS=1 in the build environment. Off until the bake has been
 * checked against the voxels and approved; development builds load the bake
 * with ?world=baked either way.
 */
const SERVE_BAKED_WORLDS = process.env.SERVE_BAKED_WORLDS === "1";

/**
 * Root of the portfolio proper in one language. The world layer lives here,
 * not in the pages, so moving between landing pages never restarts the world
 * that is loading (or already warm) behind them.
 */
export default function SiteShell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  // Read at build time: the default map is whatever maps/index.json names in the deployed commit.
  const { defaultMapId } = readMapIndex();

  return (
    <RootDocument lang={locale}>
      <LocaleProvider locale={locale}>
        {children}
        <WorldLayer defaultMapId={defaultMapId} bakes={listFreshBakes()} serveBakes={SERVE_BAKED_WORLDS} minimaps={readAllMinimaps()} />
      </LocaleProvider>
    </RootDocument>
  );
}
