import { isRenderableBlock, type BlockId } from "./block-registry";
import { getWorldMaxY, WORLD_CONFIG } from "@/lib/world/world-config";

// The center-platform "wave" reveal timing shared by every renderer that
// grows terrain in on load: the instanced cube-reveal path (voxel-world.ts's
// renderable cells) and the surface-mesh reveal path (surface-mesher.ts).
// Both need identical numbers here or the two renderers would animate out of
// sync with each other whenever a project switches between them mid-reveal.
const CENTER_MIN = WORLD_CONFIG.width / 2 - 1;
const CENTER_MAX = WORLD_CONFIG.width / 2;
export const MAX_WAVE_DELAY = 0.74;

// Minimal shape a world needs to have for the loader-platform lookup below —
// just enough of VoxelWorld's surface that reveal.ts doesn't have to import
// the class itself (which imports back from this module).
type LoaderPlatformWorld = {
  getBlock(x: number, y: number, z: number): BlockId;
  config: { minY: number; height: number };
};

// Which cell is "the loader platform" (always fully revealed, no growth
// delay, plus the gentle idle wave, plus its own fixed look) is driven by
// *position*, not block type or material: whichever cell is the topmost
// renderable block in the map's fixed center 2x2 footprint is the loader,
// no matter what block/material happens to be painted there. This is what
// lets the intro/reveal keep following the loader platform as it's rebuilt
// or re-skinned in the editor (stacking slabs on top, repainting materials)
// instead of breaking every time someone changes what's *in* the cell.
export function isLoaderPlatformTopCell(world: LoaderPlatformWorld, x: number, y: number, z: number): boolean {
  if (x < CENTER_MIN || x > CENTER_MAX || z < CENTER_MIN || z > CENTER_MAX) {
    return false;
  }

  if (!isRenderableBlock(world.getBlock(x, y, z))) {
    return false;
  }

  for (let aboveY = y + 1; aboveY <= getWorldMaxY(world.config); aboveY += 1) {
    if (isRenderableBlock(world.getBlock(x, aboveY, z))) {
      return false;
    }
  }

  return true;
}

export function distanceFromCenterPlatform(x: number, z: number): number {
  const dx = x < CENTER_MIN ? CENTER_MIN - x : x > CENTER_MAX ? x - CENTER_MAX : 0;
  const dz = z < CENTER_MIN ? CENTER_MIN - z : z > CENTER_MAX ? z - CENTER_MAX : 0;

  return Math.hypot(dx, dz);
}

export function computeExpansionDelay(world: LoaderPlatformWorld, x: number, y: number, z: number): number {
  if (isLoaderPlatformTopCell(world, x, y, z)) {
    return 0;
  }

  return (distanceFromCenterPlatform(x, z) / distanceFromCenterPlatform(0, 0)) * MAX_WAVE_DELAY;
}
