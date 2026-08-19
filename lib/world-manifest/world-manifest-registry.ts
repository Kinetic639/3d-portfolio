import { listMapRegistryEntries, loadMapStateSync } from "@/lib/maps/map-registry";
import {
  cloneWorldManifest,
  createPortfolioWorldManifest,
  validateWorldManifest,
  type WorldManifest,
} from "./world-manifest";
import { WORLD_CONFIG } from "@/lib/world/world-config";

export const DEFAULT_WORLD_MANIFEST_ID = "portfolio-world";

type BundledWorldManifest = {
  id: string;
  load: () => WorldManifest;
};

const BUNDLED_WORLD_MANIFESTS: BundledWorldManifest[] = [{
  id: DEFAULT_WORLD_MANIFEST_ID,
  load: () => createPortfolioWorldManifest(),
}];

export function listWorldManifestRegistryEntries() {
  return BUNDLED_WORLD_MANIFESTS.map((entry) => ({ id: entry.id }));
}

export function resolveWorldManifestSync(manifestId: string) {
  const source = BUNDLED_WORLD_MANIFESTS.find((entry) => entry.id === manifestId);
  if (!source) throw new Error(`Unknown world manifest id: ${manifestId}.`);
  const validation = validateWorldManifest(source.load());
  if (!validation.ok) throw new Error(`World manifest ${manifestId} is invalid:\n${validation.errors.join("\n")}`);
  validateRegionMapReferences(validation.manifest);
  return cloneWorldManifest(validation.manifest);
}

export function validateWorldManifestRegistry() {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const source of BUNDLED_WORLD_MANIFESTS) {
    if (ids.has(source.id)) errors.push(`Duplicate world manifest id: ${source.id}.`);
    ids.add(source.id);
    const validation = validateWorldManifest(source.load());
    if (!validation.ok) {
      errors.push(...validation.errors.map((error) => `${source.id}: ${error}`));
      continue;
    }
    try {
      validateRegionMapReferences(validation.manifest);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return errors.length > 0 ? { ok: false as const, errors } : { ok: true as const };
}

export function validateRegionMapReferences(manifest: WorldManifest) {
  const knownMapIds = new Set(listMapRegistryEntries({ includeDevelopment: true }).map((entry) => entry.id));
  for (const region of manifest.regions) {
    if (!knownMapIds.has(region.mapId)) throw new Error(`World manifest ${manifest.id} references unknown map ${region.mapId} for region ${region.id}.`);
    const map = loadMapStateSync(region.mapId, { includeDevelopment: true }).definition;
    if (
      map.dimensions.width !== WORLD_CONFIG.width ||
      map.dimensions.depth !== WORLD_CONFIG.depth ||
      map.dimensions.minY !== manifest.dimensions.minY ||
      map.dimensions.height !== manifest.dimensions.height
    ) {
      throw new Error(`Map ${region.mapId} dimensions do not match region ${region.id}.`);
    }
  }
}
