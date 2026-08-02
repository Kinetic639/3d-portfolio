import { isRenderableBlock, type BlockId } from "./block-registry";
import { type GridCoordinate, type WorldPosition } from "./world-config";
import type { VoxelWorld } from "./voxel-world";

export type TerrainSurface = {
  valid: true;
  grid: GridCoordinate;
  blockId: BlockId;
  surfaceY: number;
  worldPosition: WorldPosition;
  normal: { x: 0; y: 1; z: 0 };
};

export type TerrainSurfaceResult = TerrainSurface | { valid: false; reason: string };

export function getTerrainSurfaceAt(world: VoxelWorld, gridX: number, gridZ: number): TerrainSurfaceResult {
  if (!Number.isInteger(gridX) || !Number.isInteger(gridZ)) {
    return { valid: false, reason: "Surface coordinates must be integer grid columns." };
  }
  if (gridX < 0 || gridX >= world.config.width || gridZ < 0 || gridZ >= world.config.depth) {
    return { valid: false, reason: "Surface coordinate is outside the world." };
  }

  const y = world.getHighestNonAirY(gridX, gridZ);
  if (y === null) {
    return { valid: false, reason: "No supporting terrain cell in this column." };
  }

  const blockId = world.getBlock(gridX, y, gridZ);
  if (!isRenderableBlock(blockId)) {
    return { valid: false, reason: "Highest cell is not a renderable support surface." };
  }

  const center = world.gridToWorld(gridX, y, gridZ);
  const surfaceY = center.y + world.config.blockSize / 2;
  return {
    valid: true,
    grid: { x: gridX, y, z: gridZ },
    blockId,
    surfaceY,
    worldPosition: { x: center.x, y: surfaceY, z: center.z },
    normal: { x: 0, y: 1, z: 0 },
  };
}

export function getTerrainSurfaceAtWorld(world: VoxelWorld, position: Pick<WorldPosition, "x" | "z">) {
  const gridX = Math.floor(position.x / world.config.blockSize + world.config.width / 2);
  const gridZ = Math.floor(position.z / world.config.blockSize + world.config.depth / 2);
  return getTerrainSurfaceAt(world, gridX, gridZ);
}
