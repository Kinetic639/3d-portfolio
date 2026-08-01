import { createFlatVoxelWorld, type RenderChunk, type RenderableCell, type VoxelWorld } from "@/lib/world/voxel-world";
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
export const TERRAIN_CHUNK_COUNT = WORLD_CHUNK_COUNT;

export type TerrainCell = {
  index: number;
  cellIndex: number;
  x: number;
  y: number;
  z: number;
  worldX: number;
  worldY: number;
  worldZ: number;
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
  centerCells: TerrainCell[];
  instanceCount: number;
  logicalCellCount: number;
  airCellCount: number;
  nonAirBlockCount: number;
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
  const world = createFlatVoxelWorld();
  const stats = world.getStats();
  const chunks = world.createRenderChunks().map(toTerrainChunk);
  const centerCells = chunks.flatMap((chunk) => chunk.cells.filter((cell) => cell.isCenterLoaderBlock));

  return {
    world,
    chunks,
    centerCells,
    instanceCount: stats.renderedInstances,
    logicalCellCount: stats.logicalCells,
    airCellCount: stats.airCells,
    nonAirBlockCount: stats.nonAirBlocks,
  };
}

function toTerrainChunk(chunk: RenderChunk): TerrainChunk {
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

function toTerrainCell(cell: RenderableCell, index: number): TerrainCell {
  return {
    index,
    cellIndex: cell.cellIndex,
    x: cell.x,
    y: cell.y,
    z: cell.z,
    worldX: cell.worldX,
    worldY: cell.worldY,
    worldZ: cell.worldZ,
    expansionDelay: cell.expansionDelay,
    variation: cell.variation,
    isCenterLoaderBlock: cell.isCenterLoaderBlock,
  };
}
