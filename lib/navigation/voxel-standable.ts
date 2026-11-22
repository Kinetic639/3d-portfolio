import { getBlockDefinition } from "@/lib/world/block-registry";
import { getTerrainSurfaceAt } from "@/lib/world/surface-query";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import { getShapeDefinition } from "@/lib/voxel-shapes/shape-registry";

/** Cells above the ground a creature needs free (the guide is a bit under two blocks tall). */
export const HEADROOM_CELLS = 2;

/**
 * Whether a creature can stand in a column of the voxel world: the surface it
 * would stand on is walkable and not water, and the cells above it are free of
 * anything that blocks movement (docs/navigation.md, layer 1). The bake
 * stores this per column, so the baked world answers the same.
 */
export function voxelColumnStandable(world: VoxelWorld, column: number, row: number) {
  const surface = getTerrainSurfaceAt(world, column, row);
  if (!surface.valid || !surface.walkable || surface.fluid) return false;
  for (let up = 1; up <= HEADROOM_CELLS; up += 1) {
    const y = surface.grid.y + up;
    const blockId = world.getBlock(column, y, row);
    if (blockId === 0 || !getBlockDefinition(blockId).renderable) continue;
    if (getShapeDefinition(world.getShape(column, y, row)).blocksMovement) return false;
  }
  return true;
}
