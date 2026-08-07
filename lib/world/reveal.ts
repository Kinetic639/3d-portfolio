import { BLOCK_IDS, type BlockId } from "./block-registry";
import { WORLD_CONFIG } from "@/lib/world/world-config";

// The center-platform "wave" reveal timing shared by every renderer that
// grows terrain in on load: the instanced cube-reveal path (voxel-world.ts's
// renderable cells) and the surface-mesh reveal path (surface-mesher.ts).
// Both need identical numbers here or the two renderers would animate out of
// sync with each other whenever a project switches between them mid-reveal.
const CENTER_MIN = WORLD_CONFIG.width / 2 - 1;
const CENTER_MAX = WORLD_CONFIG.width / 2;
export const MAX_WAVE_DELAY = 0.74;

// Which cells are "the loader platform" (always fully revealed, no growth
// delay, plus the gentle idle wave) is driven by block *type*, not a fixed
// grid position — whatever cells are painted with the LoaderOrigin block
// are the loader platform, at whatever Y level(s) they're placed on. This
// is what actually lets the intro/reveal follow the loader platform as it's
// rebuilt in the editor (e.g. stacking slabs on top of the original cells)
// instead of a hardcoded coordinate that stops matching the moment the
// platform's layout changes.
export function isLoaderOriginBlock(blockId: BlockId): boolean {
  return blockId === BLOCK_IDS.LoaderOrigin;
}

export function distanceFromCenterPlatform(x: number, z: number): number {
  const dx = x < CENTER_MIN ? CENTER_MIN - x : x > CENTER_MAX ? x - CENTER_MAX : 0;
  const dz = z < CENTER_MIN ? CENTER_MIN - z : z > CENTER_MAX ? z - CENTER_MAX : 0;

  return Math.hypot(dx, dz);
}

export function computeExpansionDelay(blockId: BlockId, x: number, z: number): number {
  if (isLoaderOriginBlock(blockId)) {
    return 0;
  }

  return (distanceFromCenterPlatform(x, z) / distanceFromCenterPlatform(0, 0)) * MAX_WAVE_DELAY;
}
