import { getBlockDefinition, isRenderableBlock, type BlockId } from "./block-registry";
import { getWorldMaxY, type GridCoordinate, type WorldPosition } from "./world-config";
import type { VoxelWorld } from "./voxel-world";
import { getShapeDefinition } from "@/lib/voxel-shapes/shape-registry";
import type { CellRotation, ShapeId } from "@/lib/voxel-shapes/shape-ids";

export type TerrainSurface = {
  valid: true;
  grid: GridCoordinate;
  blockId: BlockId;
  shapeId: ShapeId;
  rotation: CellRotation;
  state: number;
  surfaceY: number;
  worldPosition: WorldPosition;
  normal: { x: number; y: number; z: number };
  solidSupport: boolean;
  walkable: boolean;
  fluid: boolean;
};

export type TerrainSurfaceResult = TerrainSurface | { valid: false; reason: string };

export function getTerrainSurfaceAt(world: VoxelWorld, gridX: number, gridZ: number): TerrainSurfaceResult {
  return getTerrainSurfaceAtWorldPosition(world, world.gridToWorld(gridX, 0, gridZ));
}

export function getTerrainSurfaceAtWorldPosition(world: VoxelWorld, position: Pick<WorldPosition, "x" | "z">): TerrainSurfaceResult {
  const gridX = Math.floor(position.x / world.config.blockSize + world.config.width / 2);
  const gridZ = Math.floor(position.z / world.config.blockSize + world.config.depth / 2);
  if (!Number.isInteger(gridX) || !Number.isInteger(gridZ)) {
    return { valid: false, reason: "Surface coordinates must be integer grid columns." };
  }
  if (gridX < 0 || gridX >= world.config.width || gridZ < 0 || gridZ >= world.config.depth) {
    return { valid: false, reason: "Surface coordinate is outside the world." };
  }

  const y = getHighestSupportingSurfaceInColumn(world, gridX, gridZ);
  if (y === null) {
    return { valid: false, reason: "No supporting terrain cell in this column." };
  }

  const blockId = world.getBlock(gridX, y, gridZ);
  if (!isRenderableBlock(blockId)) {
    return { valid: false, reason: "Highest cell is not a renderable support surface." };
  }

  const center = world.gridToWorld(gridX, y, gridZ);
  const localX = position.x / world.config.blockSize + world.config.width / 2 - gridX - 0.5;
  const localZ = position.z / world.config.blockSize + world.config.depth / 2 - gridZ - 0.5;
  const shapeId = world.getShape(gridX, y, gridZ);
  const rotation = world.getRotation(gridX, y, gridZ);
  const state = world.getState(gridX, y, gridZ);
  const surface = getCellSurfaceAtLocalPosition(world, { x: gridX, y, z: gridZ }, localX, localZ);
  if (!surface.valid) {
    return { valid: false, reason: "Highest cell has no valid support surface." };
  }
  const surfaceY = center.y + surface.height * world.config.blockSize;
  return {
    valid: true,
    grid: { x: gridX, y, z: gridZ },
    blockId,
    shapeId,
    rotation,
    state,
    surfaceY,
    worldPosition: { x: center.x, y: surfaceY, z: center.z },
    normal: { x: surface.normal[0], y: surface.normal[1], z: surface.normal[2] },
    solidSupport: surface.solidSupport,
    walkable: surface.walkable,
    fluid: surface.fluid,
  };
}

export function getTerrainSurfaceAtWorld(world: VoxelWorld, position: Pick<WorldPosition, "x" | "z">) {
  return getTerrainSurfaceAtWorldPosition(world, position);
}

export function getCellSurfaceAtLocalPosition(world: VoxelWorld, coordinate: GridCoordinate, localX: number, localZ: number) {
  const blockId = world.getBlock(coordinate.x, coordinate.y, coordinate.z);
  if (!isRenderableBlock(blockId)) {
    return { valid: false, height: 0, normal: [0, 1, 0] as [number, number, number], solidSupport: false, walkable: false, fluid: false };
  }

  return getShapeDefinition(world.getShape(coordinate.x, coordinate.y, coordinate.z))
    .surfaceAt(localX, localZ, world.getRotation(coordinate.x, coordinate.y, coordinate.z), world.getState(coordinate.x, coordinate.y, coordinate.z));
}

export function getSurfaceNormalAt(world: VoxelWorld, coordinate: GridCoordinate, localX = 0, localZ = 0) {
  return getCellSurfaceAtLocalPosition(world, coordinate, localX, localZ).normal;
}

export function getHighestSupportingSurfaceInColumn(world: VoxelWorld, gridX: number, gridZ: number) {
  if (gridX < 0 || gridX >= world.config.width || gridZ < 0 || gridZ >= world.config.depth) {
    return null;
  }

  for (let y = getWorldMaxY(world.config); y >= world.config.minY; y -= 1) {
    const blockId = world.getBlock(gridX, y, gridZ);
    if (blockId === 0 || !getBlockDefinition(blockId).renderable) {
      continue;
    }
    const shape = getShapeDefinition(world.getShape(gridX, y, gridZ));
    if (shape.surfaceAt(0, 0, world.getRotation(gridX, y, gridZ), world.getState(gridX, y, gridZ)).valid) {
      return y;
    }
  }

  return null;
}
