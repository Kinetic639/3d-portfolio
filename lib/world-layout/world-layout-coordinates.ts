import { WORLD_CONFIG, type GridCoordinate, type WorldPosition } from "@/lib/world/world-config";
import type { WorldRegionGridOffset, WorldRegionId } from "./world-layout-types";
import { WORLD_REGION_SLOTS } from "./world-region";

export type RegionCellCoordinate = Readonly<{
  regionId: WorldRegionId;
  local: GridCoordinate;
}>;

export type InternalChunkCoordinate = Readonly<{
  chunkX: number;
  chunkZ: number;
  localX: number;
  localZ: number;
}>;

const REGION_ID_BY_OFFSET = new Map<string, WorldRegionId>(
  Object.values(WORLD_REGION_SLOTS).map((slot) => [offsetKey(slot.offset), slot.id]),
);

export function regionCellToGlobalCell(regionId: WorldRegionId, local: GridCoordinate): GridCoordinate | null {
  if (!isInsideRegion(local)) return null;
  const offset = WORLD_REGION_SLOTS[regionId].offset;
  return {
    x: offset.x * WORLD_CONFIG.width + local.x,
    y: local.y,
    z: offset.z * WORLD_CONFIG.depth + local.z,
  };
}

export function globalCellToRegionCell(global: GridCoordinate): RegionCellCoordinate | null {
  if (!Number.isInteger(global.x) || !Number.isInteger(global.y) || !Number.isInteger(global.z)) return null;
  if (global.y < 0 || global.y >= WORLD_CONFIG.height) return null;

  const offsetX = Math.floor(global.x / WORLD_CONFIG.width);
  const offsetZ = Math.floor(global.z / WORLD_CONFIG.depth);
  const regionId = REGION_ID_BY_OFFSET.get(`${offsetX},${offsetZ}`);
  if (!regionId) return null;

  return {
    regionId,
    local: {
      x: positiveModulo(global.x, WORLD_CONFIG.width),
      y: global.y,
      z: positiveModulo(global.z, WORLD_CONFIG.depth),
    },
  };
}

export function regionCellToWorldPosition(regionId: WorldRegionId, local: GridCoordinate): WorldPosition | null {
  const global = regionCellToGlobalCell(regionId, local);
  if (!global) return null;
  return globalCellToWorldPosition(global);
}

export function globalCellToWorldPosition(global: GridCoordinate): WorldPosition {
  return {
    x: (global.x - (WORLD_CONFIG.width - 1) / 2) * WORLD_CONFIG.blockSize,
    y: (global.y + 0.5) * WORLD_CONFIG.blockSize,
    z: (global.z - (WORLD_CONFIG.depth - 1) / 2) * WORLD_CONFIG.blockSize,
  };
}

export function worldPositionToRegionCell(position: WorldPosition): RegionCellCoordinate | null {
  const global = {
    x: Math.floor(position.x / WORLD_CONFIG.blockSize + WORLD_CONFIG.width / 2),
    y: Math.floor(position.y / WORLD_CONFIG.blockSize),
    z: Math.floor(position.z / WORLD_CONFIG.blockSize + WORLD_CONFIG.depth / 2),
  };
  return globalCellToRegionCell(global);
}

export function regionCellToInternalChunk(local: Pick<GridCoordinate, "x" | "z">): InternalChunkCoordinate | null {
  if (!Number.isInteger(local.x) || !Number.isInteger(local.z)) return null;
  if (local.x < 0 || local.x >= WORLD_CONFIG.width || local.z < 0 || local.z >= WORLD_CONFIG.depth) return null;
  return {
    chunkX: Math.floor(local.x / WORLD_CONFIG.chunkSize),
    chunkZ: Math.floor(local.z / WORLD_CONFIG.chunkSize),
    localX: local.x % WORLD_CONFIG.chunkSize,
    localZ: local.z % WORLD_CONFIG.chunkSize,
  };
}

export function getRegionIdAtOffset(offset: WorldRegionGridOffset): WorldRegionId {
  return REGION_ID_BY_OFFSET.get(offsetKey(offset))!;
}

function isInsideRegion(coordinate: GridCoordinate) {
  return Number.isInteger(coordinate.x)
    && Number.isInteger(coordinate.y)
    && Number.isInteger(coordinate.z)
    && coordinate.x >= 0
    && coordinate.x < WORLD_CONFIG.width
    && coordinate.y >= 0
    && coordinate.y < WORLD_CONFIG.height
    && coordinate.z >= 0
    && coordinate.z < WORLD_CONFIG.depth;
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function offsetKey(offset: Pick<WorldRegionGridOffset, "x" | "z">) {
  return `${offset.x},${offset.z}`;
}

