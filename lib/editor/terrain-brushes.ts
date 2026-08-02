import { BLOCK_IDS, type BlockId } from "@/lib/world/block-registry";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import { WORLD_CONFIG, type GridCoordinate } from "@/lib/world/world-config";

export type BrushShape = "single" | "square" | "circle";
export type TerrainBrushOperation =
  | "paint"
  | "erase"
  | "raise"
  | "lower"
  | "flatten"
  | "fill"
  | "clear"
  | "paint-path"
  | "remove-path"
  | "assign-zone"
  | "remove-zone";

export type TerrainBrushSettings = {
  shape: BrushShape;
  size: number;
  pathWidth: number;
  pathEnds: "square" | "round";
  flattenHeight: number;
};

export type TerrainCellMutation = {
  coordinate: GridCoordinate;
  beforeBlock: BlockId;
  afterBlock: BlockId;
  beforeZone: number;
  afterZone: number;
};

export const DEFAULT_TERRAIN_BRUSH: TerrainBrushSettings = {
  shape: "single",
  size: 1,
  pathWidth: 1,
  pathEnds: "square",
  flattenHeight: 0,
};

export function getBrushFootprint(center: GridCoordinate, settings: TerrainBrushSettings): GridCoordinate[] {
  const size = Math.max(1, Math.floor(settings.size));
  if (settings.shape === "single" || size <= 1) {
    return isInsideColumn(center.x, center.z) ? [{ ...center }] : [];
  }

  const radius = Math.floor(size / 2);
  const cells: GridCoordinate[] = [];
  for (let z = center.z - radius; z <= center.z + radius; z += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      if (!isInsideColumn(x, z)) continue;
      if (settings.shape === "circle" && Math.hypot(x - center.x, z - center.z) > radius + 0.001) continue;
      cells.push({ x, y: center.y, z });
    }
  }
  return cells;
}

export function getPathFootprint(center: GridCoordinate, settings: TerrainBrushSettings): GridCoordinate[] {
  return getBrushFootprint(center, {
    ...settings,
    shape: settings.pathEnds === "round" ? "circle" : "square",
    size: Math.min(9, Math.max(1, settings.pathWidth)),
  });
}

export function getTerrainOperationFootprint(
  center: GridCoordinate,
  operation: TerrainBrushOperation,
  settings: TerrainBrushSettings,
): GridCoordinate[] {
  return operation === "paint-path" || operation === "remove-path"
    ? getPathFootprint(center, settings)
    : getBrushFootprint(center, settings);
}

export function createTerrainMutations(input: {
  world: VoxelWorld;
  operation: TerrainBrushOperation;
  center: GridCoordinate;
  settings?: Partial<TerrainBrushSettings>;
  blockId: BlockId;
  zoneId: number;
}): TerrainCellMutation[] {
  const settings = { ...DEFAULT_TERRAIN_BRUSH, ...input.settings };
  const footprint = getTerrainOperationFootprint(input.center, input.operation, settings);
  const seen = new Set<string>();
  const mutations: TerrainCellMutation[] = [];

  for (const cell of footprint) {
    const mutation = createCellMutation(input.world, input.operation, cell, settings, input.blockId, input.zoneId);
    if (!mutation) continue;
    const key = `${mutation.coordinate.x},${mutation.coordinate.y},${mutation.coordinate.z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mutations.push(mutation);
  }

  return mutations;
}

export function getDirtyChunkIdsForMutations(world: VoxelWorld, mutations: TerrainCellMutation[]) {
  const before = new Set(world.dirtyChunks);
  const ids = new Set<string>();

  for (const mutation of mutations) {
    world.markChunkDirtyForCell(mutation.coordinate.x, mutation.coordinate.z);
  }

  for (const id of world.dirtyChunks) {
    if (!before.has(id)) ids.add(id);
  }

  world.dirtyChunks.clear();
  for (const id of before) world.dirtyChunks.add(id);

  return [...ids].sort();
}

function createCellMutation(
  world: VoxelWorld,
  operation: TerrainBrushOperation,
  cell: GridCoordinate,
  settings: TerrainBrushSettings,
  blockId: BlockId,
  zoneId: number,
): TerrainCellMutation | null {
  if (!world.isInsideWorld(cell.x, cell.y, cell.z)) return null;

  const topY = world.getHighestNonAirY(cell.x, cell.z);
  let target: GridCoordinate = { ...cell };
  let afterBlock = world.getBlock(cell.x, cell.y, cell.z);
  let afterZone = world.getZone(cell.x, cell.y, cell.z);

  switch (operation) {
    case "paint":
    case "fill":
      if (afterBlock === BLOCK_IDS.Air && operation === "paint") return null;
      afterBlock = blockId;
      break;
    case "erase":
    case "clear":
      afterBlock = BLOCK_IDS.Air;
      afterZone = 0;
      break;
    case "raise": {
      const y = topY === null ? 0 : topY + 1;
      if (y >= WORLD_CONFIG.height) return null;
      target = { x: cell.x, y, z: cell.z };
      afterBlock = blockId === BLOCK_IDS.Air ? BLOCK_IDS.Ground : blockId;
      afterZone = world.getZone(target.x, target.y, target.z);
      break;
    }
    case "lower": {
      if (topY === null || topY <= 0) return null;
      target = { x: cell.x, y: topY, z: cell.z };
      afterBlock = BLOCK_IDS.Air;
      afterZone = 0;
      break;
    }
    case "flatten": {
      const desiredY = Math.max(0, Math.min(WORLD_CONFIG.height - 1, Math.floor(settings.flattenHeight)));
      if (cell.y > desiredY) {
        afterBlock = BLOCK_IDS.Air;
        afterZone = 0;
      } else if (cell.y === desiredY) {
        afterBlock = blockId === BLOCK_IDS.Air ? BLOCK_IDS.Ground : blockId;
      }
      break;
    }
    case "paint-path":
      target = { x: cell.x, y: topY ?? 0, z: cell.z };
      afterBlock = blockId;
      afterZone = world.getZone(target.x, target.y, target.z);
      break;
    case "remove-path":
      target = { x: cell.x, y: topY ?? 0, z: cell.z };
      afterBlock = BLOCK_IDS.Ground;
      afterZone = world.getZone(target.x, target.y, target.z);
      break;
    case "assign-zone":
      afterZone = zoneId;
      break;
    case "remove-zone":
      afterZone = 0;
      break;
  }

  if (!world.isInsideWorld(target.x, target.y, target.z)) return null;
  const beforeBlock = world.getBlock(target.x, target.y, target.z);
  const beforeZone = world.getZone(target.x, target.y, target.z);
  if (beforeBlock === afterBlock && beforeZone === afterZone) return null;

  return {
    coordinate: target,
    beforeBlock,
    afterBlock,
    beforeZone,
    afterZone,
  };
}

function isInsideColumn(x: number, z: number) {
  return x >= 0 && x < WORLD_CONFIG.width && z >= 0 && z < WORLD_CONFIG.depth;
}
