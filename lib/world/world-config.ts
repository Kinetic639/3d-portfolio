export const WORLD_CONFIG = {
  width: 64,
  depth: 64,
  height: 12,
  blockSize: 1,
  chunkSize: 16,
} as const;

export type WorldConfig = typeof WORLD_CONFIG;

export type GridCoordinate = {
  x: number;
  y: number;
  z: number;
};

export type WorldPosition = {
  x: number;
  y: number;
  z: number;
};

export const WORLD_CELL_COUNT = WORLD_CONFIG.width * WORLD_CONFIG.depth * WORLD_CONFIG.height;
export const WORLD_SURFACE_CELL_COUNT = WORLD_CONFIG.width * WORLD_CONFIG.depth;
export const WORLD_AIR_CELL_COUNT = WORLD_CELL_COUNT - WORLD_SURFACE_CELL_COUNT;
export const CHUNKS_PER_AXIS = WORLD_CONFIG.width / WORLD_CONFIG.chunkSize;
export const WORLD_CHUNK_COUNT = CHUNKS_PER_AXIS * CHUNKS_PER_AXIS;
export const CHUNK_SURFACE_CELL_COUNT = WORLD_CONFIG.chunkSize * WORLD_CONFIG.chunkSize;
