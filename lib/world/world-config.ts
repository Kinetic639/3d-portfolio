export const WORLD_CONFIG = {
  width: 64,
  depth: 64,
  minY: -12,
  height: 32,
  blockSize: 1,
  chunkSize: 16,
} as const;

export const COMPOSITE_WORLD_CONFIG: WorldConfig = {
  ...WORLD_CONFIG,
  width: WORLD_CONFIG.width * 3,
  depth: WORLD_CONFIG.depth * 3,
};

export type WorldConfig = {
  width: number;
  depth: number;
  minY: number;
  height: number;
  blockSize: number;
  chunkSize: number;
};

export function getWorldMaxY(config: Pick<WorldConfig, "minY" | "height"> = WORLD_CONFIG) {
  return config.minY + config.height - 1;
}

export function getChunkCounts(config: Pick<WorldConfig, "width" | "depth" | "chunkSize"> = WORLD_CONFIG) {
  return {
    x: config.width / config.chunkSize,
    z: config.depth / config.chunkSize,
  };
}

export function getWorldChunkCount(config: Pick<WorldConfig, "width" | "depth" | "chunkSize"> = WORLD_CONFIG) {
  const chunks = getChunkCounts(config);
  return chunks.x * chunks.z;
}

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
export const WORLD_FOUNDATION_LEVEL_COUNT = 1 - WORLD_CONFIG.minY;
export const WORLD_FOUNDATION_CELL_COUNT = WORLD_SURFACE_CELL_COUNT * WORLD_FOUNDATION_LEVEL_COUNT;
export const WORLD_AIR_CELL_COUNT = WORLD_CELL_COUNT - WORLD_FOUNDATION_CELL_COUNT;
export const CHUNKS_PER_AXIS = getChunkCounts().x;
export const WORLD_CHUNK_COUNT = getWorldChunkCount();
export const CHUNK_SURFACE_CELL_COUNT = WORLD_CONFIG.chunkSize * WORLD_CONFIG.chunkSize;
