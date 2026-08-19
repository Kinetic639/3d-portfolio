import { isRenderableBlock, type BlockId } from "./block-registry";
import { getWorldMaxY, WORLD_CONFIG } from "@/lib/world/world-config";

// The center-platform "wave" reveal timing shared by every renderer that
// grows terrain in on load: the instanced cube-reveal path (voxel-world.ts's
// renderable cells) and the surface-mesh reveal path (surface-mesher.ts).
// Both need identical numbers here or the two renderers would animate out of
// sync with each other whenever a project switches between them mid-reveal.
export const MAX_WAVE_DELAY = 0.74;

// Minimal shape a world needs to have for the loader-platform lookup below —
// just enough of VoxelWorld's surface that reveal.ts doesn't have to import
// the class itself (which imports back from this module).
type LoaderPlatformWorld = {
  getBlock(x: number, y: number, z: number): BlockId;
  config: { width: number; depth: number; minY: number; height: number };
};

type RevealDimensions = Pick<LoaderPlatformWorld["config"], "width" | "depth">;

function getCenterBounds(size: number) {
  return { min: size / 2 - 1, max: size / 2 };
}

// Which cell is "the loader platform" (always fully revealed, no growth
// delay, plus the gentle idle wave, plus its own fixed look) is driven by
// *position*, not block type or material: whichever cell is the topmost
// renderable block in the map's fixed center 2x2 footprint is the loader,
// no matter what block/material happens to be painted there. This is what
// lets the intro/reveal keep following the loader platform as it's rebuilt
// or re-skinned in the editor (stacking slabs on top, repainting materials)
// instead of breaking every time someone changes what's *in* the cell.
export function isLoaderPlatformTopCell(world: LoaderPlatformWorld, x: number, y: number, z: number): boolean {
  const centerX = getCenterBounds(world.config.width);
  const centerZ = getCenterBounds(world.config.depth);
  if (x < centerX.min || x > centerX.max || z < centerZ.min || z > centerZ.max) {
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

export function distanceFromCenterPlatform(x: number, z: number, dimensions: RevealDimensions = WORLD_CONFIG): number {
  const centerX = getCenterBounds(dimensions.width);
  const centerZ = getCenterBounds(dimensions.depth);
  const dx = x < centerX.min ? centerX.min - x : x > centerX.max ? x - centerX.max : 0;
  const dz = z < centerZ.min ? centerZ.min - z : z > centerZ.max ? z - centerZ.max : 0;

  return Math.hypot(dx, dz);
}

export function computeExpansionDelay(world: LoaderPlatformWorld, x: number, y: number, z: number): number {
  if (isLoaderPlatformTopCell(world, x, y, z)) {
    return 0;
  }

  // Keep the established 64x64 reveal speed. Larger worlds extend the same
  // wave beyond the former boundary instead of renormalizing its duration.
  const originalCornerDistance = distanceFromCenterPlatform(0, 0, WORLD_CONFIG);
  return (distanceFromCenterPlatform(x, z, world.config) / originalCornerDistance) * MAX_WAVE_DELAY;
}
