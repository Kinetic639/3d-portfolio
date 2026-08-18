import { createFlatVoxelWorld, type RenderChunk, type RenderableCell, type VoxelWorld } from "@/lib/world/voxel-world";
import { BLOCK_IDS, getBlockDefinition, type BlockId } from "@/lib/world/block-registry";
import type { CellRotation, ShapeId } from "@/lib/voxel-shapes/shape-ids";
import { buildSurfaceChunkMeshes, type SurfaceChunkMeshData } from "./surface-mesher";
import { buildWaterChunkMeshes, type WaterChunkMeshData } from "./water-mesher";
import {
  CHUNK_SURFACE_CELL_COUNT,
  CHUNKS_PER_AXIS,
  WORLD_CHUNK_COUNT,
  WORLD_CONFIG,
  WORLD_SURFACE_CELL_COUNT,
} from "@/lib/world/world-config";

export const TERRAIN_SIZE_X = WORLD_CONFIG.width;
export const TERRAIN_SIZE_Z = WORLD_CONFIG.depth;
export const TERRAIN_LEVELS_Y = WORLD_CONFIG.height;
export const CHUNK_SIZE = WORLD_CONFIG.chunkSize;
export { CHUNKS_PER_AXIS };
export const TERRAIN_INSTANCE_COUNT = WORLD_SURFACE_CELL_COUNT;
export const CHUNK_INSTANCE_COUNT = CHUNK_SURFACE_CELL_COUNT;
export const CHUNK_MAX_INSTANCE_COUNT = CHUNK_SIZE * CHUNK_SIZE * TERRAIN_LEVELS_Y;
export const TERRAIN_CHUNK_COUNT = WORLD_CHUNK_COUNT;

export type TerrainCell = {
  index: number;
  cellIndex: number;
  blockId: BlockId;
  shapeId: ShapeId;
  rotation: CellRotation;
  state: number;
  x: number;
  y: number;
  z: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  color: [number, number, number];
  expansionDelay: number;
  variation: number;
  isCenterLoaderBlock: boolean;
};

export type TerrainChunk = {
  id: string;
  chunkX: number;
  chunkZ: number;
  instanceToCell: Uint32Array;
  cellToInstance: Map<number, number>;
  bounds: RenderChunk["bounds"];
  boundingBox: RenderChunk["boundingBox"];
  cells: TerrainCell[];
};

export type TerrainData = {
  world: VoxelWorld;
  chunks: TerrainChunk[];
  surfaceChunks: SurfaceChunkMeshData[];
  waterChunks: WaterChunkMeshData[];
  centerCells: TerrainCell[];
  instanceCount: number;
  logicalCellCount: number;
  airCellCount: number;
  nonAirBlockCount: number;
  surfaceQuadCount: number;
  surfaceTriangleCount: number;
  surfaceBuildMs: number;
  waterQuadCount: number;
  waterTriangleCount: number;
  waterBuildMs: number;
};

const CENTER_MIN = WORLD_CONFIG.width / 2 - 1;
const CENTER_MAX = WORLD_CONFIG.width / 2;

export function isCenterLoaderCell(x: number, z: number) {
  return x >= CENTER_MIN && x <= CENTER_MAX && z >= CENTER_MIN && z <= CENTER_MAX;
}

export function distanceFromCenterPlatform(x: number, z: number) {
  const dx = x < CENTER_MIN ? CENTER_MIN - x : x > CENTER_MAX ? x - CENTER_MAX : 0;
  const dz = z < CENTER_MIN ? CENTER_MIN - z : z > CENTER_MAX ? z - CENTER_MAX : 0;

  return Math.hypot(dx, dz);
}

export function createTerrainData(): TerrainData {
  return createTerrainDataFromWorld(createFlatVoxelWorld());
}

export function createTerrainDataFromWorld(world: VoxelWorld): TerrainData {
  const stats = world.getStats();
  const chunks = world.createRenderChunks().map(toTerrainChunk);
  const surfaceBuild = buildSurfaceChunkMeshes(world);
  const waterBuild = buildWaterChunkMeshes(world);
  const centerCells = chunks.flatMap((chunk) => chunk.cells.filter((cell) => cell.isCenterLoaderBlock));

  return {
    world,
    chunks,
    surfaceChunks: surfaceBuild.chunks,
    waterChunks: waterBuild.chunks,
    centerCells,
    instanceCount: stats.renderedInstances,
    logicalCellCount: stats.logicalCells,
    airCellCount: stats.airCells,
    nonAirBlockCount: stats.nonAirBlocks,
    surfaceQuadCount: surfaceBuild.chunks.reduce((sum, chunk) => sum + chunk.visibleQuads, 0),
    surfaceTriangleCount: surfaceBuild.chunks.reduce((sum, chunk) => sum + chunk.triangles, 0),
    surfaceBuildMs: surfaceBuild.totalBuildMs,
    waterQuadCount: waterBuild.chunks.reduce((sum, chunk) => sum + chunk.visibleQuads, 0),
    waterTriangleCount: waterBuild.chunks.reduce((sum, chunk) => sum + chunk.triangles, 0),
    waterBuildMs: waterBuild.totalBuildMs,
  };
}

function toTerrainCell(cell: RenderableCell, index: number): TerrainCell {
  return {
    index,
    cellIndex: cell.cellIndex,
    blockId: cell.blockId,
    shapeId: cell.shapeId,
    rotation: cell.rotation,
    state: cell.state,
    x: cell.x,
    y: cell.y,
    z: cell.z,
    worldX: cell.worldX,
    worldY: cell.worldY,
    worldZ: cell.worldZ,
    // The loader platform keeps its own fixed color regardless of whatever
    // block/material is actually painted onto that cell — see
    // isLoaderPlatformTopCell in lib/world/reveal.ts.
    color: hexToRgb(
      cell.isCenterLoaderBlock
        ? getBlockDefinition(BLOCK_IDS.LoaderOrigin).developmentColor
        : getBlockDefinition(cell.blockId).developmentColor,
    ),
    expansionDelay: cell.expansionDelay,
    variation: cell.variation,
    isCenterLoaderBlock: cell.isCenterLoaderBlock,
  };
}

export function toTerrainChunk(chunk: RenderChunk): TerrainChunk {
  return {
    id: chunk.id,
    chunkX: chunk.chunkX,
    chunkZ: chunk.chunkZ,
    instanceToCell: chunk.instanceToCell,
    cellToInstance: chunk.cellToInstance,
    bounds: chunk.bounds,
    boundingBox: chunk.boundingBox,
    cells: chunk.renderableCells.map(toTerrainCell),
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const normalizedHex = hex.replace("#", "");
  const value = Number.parseInt(normalizedHex, 16);

  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}
