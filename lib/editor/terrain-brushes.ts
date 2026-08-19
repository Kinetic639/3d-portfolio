import { BLOCK_IDS, type BlockId } from "@/lib/world/block-registry";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import { getWorldMaxY, WORLD_CONFIG, type GridCoordinate } from "@/lib/world/world-config";
import { DEFAULT_ROTATION, DEFAULT_SHAPE_ID, DEFAULT_STATE, type CellRotation, type ShapeId } from "@/lib/voxel-shapes/shape-ids";

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
  beforeShape: ShapeId;
  afterShape: ShapeId;
  beforeRotation: CellRotation;
  afterRotation: CellRotation;
  beforeState: number;
  afterState: number;
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
  shapeId?: ShapeId;
  rotation?: CellRotation;
  state?: number;
  zoneId: number;
}): TerrainCellMutation[] {
  const settings = { ...DEFAULT_TERRAIN_BRUSH, ...input.settings };
  const footprint = getTerrainOperationFootprint(input.center, input.operation, settings);
  const seen = new Set<string>();
  const mutations: TerrainCellMutation[] = [];

  if (input.operation === "flatten") {
    const desiredY = Math.max(input.world.config.minY, Math.min(getWorldMaxY(input.world.config), Math.floor(input.center.y)));
    for (const cell of footprint) {
      const topY = input.world.getHighestNonAirY(cell.x, cell.z);
      if (topY === desiredY) continue;

      if (topY !== null && topY > desiredY) {
        for (let y = desiredY + 1; y <= topY; y += 1) {
          const mutation = createDirectCellMutation(input.world, { x: cell.x, y, z: cell.z }, BLOCK_IDS.Air, DEFAULT_SHAPE_ID, DEFAULT_ROTATION, DEFAULT_STATE);
          if (!mutation) continue;
          const key = `${mutation.coordinate.x},${mutation.coordinate.y},${mutation.coordinate.z}`;
          if (seen.has(key)) continue;
          seen.add(key);
          mutations.push(mutation);
        }
        continue;
      }

      const startY = topY === null ? input.world.config.minY : topY + 1;
      for (let y = startY; y <= desiredY; y += 1) {
        const mutation = createDirectCellMutation(
          input.world,
          { x: cell.x, y, z: cell.z },
          input.blockId === BLOCK_IDS.Air ? BLOCK_IDS.Ground : input.blockId,
          input.shapeId ?? DEFAULT_SHAPE_ID,
          input.rotation ?? DEFAULT_ROTATION,
          input.state ?? DEFAULT_STATE,
        );
        if (!mutation) continue;
        const key = `${mutation.coordinate.x},${mutation.coordinate.y},${mutation.coordinate.z}`;
        if (seen.has(key)) continue;
        seen.add(key);
        mutations.push(mutation);
      }
    }

    return mutations;
  }

  for (const cell of footprint) {
    const mutation = createCellMutation(input.world, input.operation, cell, settings, input.blockId, input.shapeId ?? DEFAULT_SHAPE_ID, input.rotation ?? DEFAULT_ROTATION, input.state ?? DEFAULT_STATE, input.zoneId);
    if (!mutation) continue;
    const key = `${mutation.coordinate.x},${mutation.coordinate.y},${mutation.coordinate.z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mutations.push(mutation);
  }

  return mutations;
}

function createDirectCellMutation(
  world: VoxelWorld,
  coordinate: GridCoordinate,
  afterBlock: BlockId,
  afterShape: ShapeId,
  afterRotation: CellRotation,
  afterState: number,
): TerrainCellMutation | null {
  if (!world.isInsideWorld(coordinate.x, coordinate.y, coordinate.z)) return null;

  const beforeBlock = world.getBlock(coordinate.x, coordinate.y, coordinate.z);
  const beforeShape = world.getShape(coordinate.x, coordinate.y, coordinate.z);
  const beforeRotation = world.getRotation(coordinate.x, coordinate.y, coordinate.z);
  const beforeState = world.getState(coordinate.x, coordinate.y, coordinate.z);
  const beforeZone = world.getColumnZone(coordinate.x, coordinate.z);
  const normalizedShape = afterBlock === BLOCK_IDS.Air ? DEFAULT_SHAPE_ID : afterShape;
  const normalizedRotation = afterBlock === BLOCK_IDS.Air ? DEFAULT_ROTATION : afterRotation;
  const normalizedState = afterBlock === BLOCK_IDS.Air ? DEFAULT_STATE : afterState;

  if (
    beforeBlock === afterBlock &&
    beforeShape === normalizedShape &&
    beforeRotation === normalizedRotation &&
    beforeState === normalizedState
  ) return null;

  return {
    coordinate,
    beforeBlock,
    afterBlock,
    beforeShape,
    afterShape: normalizedShape,
    beforeRotation,
    afterRotation: normalizedRotation,
    beforeState,
    afterState: normalizedState,
    beforeZone,
    afterZone: beforeZone,
  };
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
  shapeId: ShapeId,
  rotation: CellRotation,
  state: number,
  zoneId: number,
): TerrainCellMutation | null {
  if (!world.isInsideWorld(cell.x, cell.y, cell.z)) return null;

  const topY = world.getHighestNonAirY(cell.x, cell.z);
  let target: GridCoordinate = { ...cell };
  let afterBlock = world.getBlock(cell.x, cell.y, cell.z);
  let afterShape = world.getShape(cell.x, cell.y, cell.z);
  let afterRotation = world.getRotation(cell.x, cell.y, cell.z);
  let afterState = world.getState(cell.x, cell.y, cell.z);
  let afterZone = world.getColumnZone(cell.x, cell.z);

  switch (operation) {
    case "paint":
      if (afterBlock === BLOCK_IDS.Air && operation === "paint") return null;
      afterBlock = blockId;
      break;
    case "fill":
      afterBlock = blockId;
      afterShape = shapeId;
      afterRotation = rotation;
      afterState = state;
      afterZone = world.getColumnZone(cell.x, cell.z);
      break;
    case "erase":
    case "clear":
      afterBlock = BLOCK_IDS.Air;
      afterShape = DEFAULT_SHAPE_ID;
      afterRotation = DEFAULT_ROTATION;
      afterState = DEFAULT_STATE;
      afterZone = world.getColumnZone(cell.x, cell.z);
      break;
    case "raise": {
      const y = topY === null ? world.config.minY : topY + 1;
      if (y > getWorldMaxY(world.config)) return null;
      target = { x: cell.x, y, z: cell.z };
      afterBlock = blockId === BLOCK_IDS.Air ? BLOCK_IDS.Ground : blockId;
      afterShape = shapeId;
      afterRotation = rotation;
      afterState = state;
      afterZone = world.getColumnZone(target.x, target.z);
      break;
    }
    case "lower": {
      if (topY === null || topY <= world.config.minY) return null;
      target = { x: cell.x, y: topY, z: cell.z };
      afterBlock = BLOCK_IDS.Air;
      afterShape = DEFAULT_SHAPE_ID;
      afterRotation = DEFAULT_ROTATION;
      afterState = DEFAULT_STATE;
      afterZone = world.getColumnZone(target.x, target.z);
      break;
    }
    case "flatten": {
      const desiredY = Math.max(world.config.minY, Math.min(getWorldMaxY(world.config), Math.floor(settings.flattenHeight)));
      if (cell.y > desiredY) {
        afterBlock = BLOCK_IDS.Air;
        afterShape = DEFAULT_SHAPE_ID;
        afterRotation = DEFAULT_ROTATION;
        afterState = DEFAULT_STATE;
        afterZone = world.getColumnZone(cell.x, cell.z);
      } else if (cell.y === desiredY) {
        afterBlock = blockId === BLOCK_IDS.Air ? BLOCK_IDS.Ground : blockId;
        afterShape = shapeId;
        afterRotation = rotation;
        afterState = state;
      }
      break;
    }
    case "paint-path":
      target = { x: cell.x, y: topY ?? world.config.minY, z: cell.z };
      afterBlock = blockId;
      afterZone = world.getColumnZone(target.x, target.z);
      break;
    case "remove-path":
      target = { x: cell.x, y: topY ?? 0, z: cell.z };
      afterBlock = BLOCK_IDS.Ground;
      afterZone = world.getColumnZone(target.x, target.z);
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
  const beforeShape = world.getShape(target.x, target.y, target.z);
  const beforeRotation = world.getRotation(target.x, target.y, target.z);
  const beforeState = world.getState(target.x, target.y, target.z);
  const beforeZone = world.getColumnZone(target.x, target.z);
  if (
    beforeBlock === afterBlock &&
    beforeShape === afterShape &&
    beforeRotation === afterRotation &&
    beforeState === afterState &&
    beforeZone === afterZone
  ) return null;

  return {
    coordinate: target,
    beforeBlock,
    afterBlock,
    beforeShape,
    afterShape: afterBlock === BLOCK_IDS.Air ? DEFAULT_SHAPE_ID : afterShape,
    beforeRotation,
    afterRotation: afterBlock === BLOCK_IDS.Air ? DEFAULT_ROTATION : afterRotation,
    beforeState,
    afterState: afterBlock === BLOCK_IDS.Air ? DEFAULT_STATE : afterState,
    beforeZone,
    afterZone,
  };
}

function isInsideColumn(x: number, z: number) {
  return x >= 0 && x < WORLD_CONFIG.width && z >= 0 && z < WORLD_CONFIG.depth;
}
