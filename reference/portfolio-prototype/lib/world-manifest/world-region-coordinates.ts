import { WORLD_REGION_SLOTS, type WorldRegionId } from "./world-manifest";
import { WORLD_CONFIG, type GridCoordinate } from "@/lib/world/world-config";

export type RegionLocalCoordinate = GridCoordinate & { regionId: WorldRegionId };

export function regionLocalToGlobal(regionId: WorldRegionId, coordinate: GridCoordinate): GridCoordinate {
  const slot = WORLD_REGION_SLOTS[regionId];
  return {
    x: coordinate.x + slot.gridX * WORLD_CONFIG.width,
    y: coordinate.y,
    z: coordinate.z + slot.gridZ * WORLD_CONFIG.depth,
  };
}

export function globalToRegionLocal(coordinate: GridCoordinate): RegionLocalCoordinate | null {
  const gridX = Math.floor(coordinate.x / WORLD_CONFIG.width);
  const gridZ = Math.floor(coordinate.z / WORLD_CONFIG.depth);
  const entry = Object.entries(WORLD_REGION_SLOTS).find(([, slot]) => slot.gridX === gridX && slot.gridZ === gridZ);
  if (!entry || coordinate.x < 0 || coordinate.z < 0) return null;
  return {
    regionId: entry[0] as WorldRegionId,
    x: coordinate.x - gridX * WORLD_CONFIG.width,
    y: coordinate.y,
    z: coordinate.z - gridZ * WORLD_CONFIG.depth,
  };
}

export function getRegionWorldOffset(regionId: WorldRegionId) {
  const slot = WORLD_REGION_SLOTS[regionId];
  return {
    x: (slot.gridX - WORLD_REGION_SLOTS.center.gridX) * WORLD_CONFIG.width * WORLD_CONFIG.blockSize,
    z: (slot.gridZ - WORLD_REGION_SLOTS.center.gridZ) * WORLD_CONFIG.depth * WORLD_CONFIG.blockSize,
  };
}
