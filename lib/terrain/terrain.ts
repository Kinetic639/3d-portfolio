export const TERRAIN_SIZE_X = 64;
export const TERRAIN_SIZE_Z = 64;
export const TERRAIN_LEVELS_Y = 12;
export const CHUNK_SIZE = 16;
export const CHUNKS_PER_AXIS = 4;
export const TERRAIN_INSTANCE_COUNT = TERRAIN_SIZE_X * TERRAIN_SIZE_Z;
export const CHUNK_INSTANCE_COUNT = CHUNK_SIZE * CHUNK_SIZE;
export const TERRAIN_CHUNK_COUNT = CHUNKS_PER_AXIS * CHUNKS_PER_AXIS;

export type TerrainCell = {
  index: number;
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
  cells: TerrainCell[];
};

export type TerrainData = {
  chunks: TerrainChunk[];
  centerCells: TerrainCell[];
  instanceCount: number;
};

const CENTER_MIN = TERRAIN_SIZE_X / 2 - 1;
const CENTER_MAX = TERRAIN_SIZE_X / 2;
const MAX_WAVE_DELAY = 0.74;

export function isCenterLoaderCell(x: number, z: number) {
  return x >= CENTER_MIN && x <= CENTER_MAX && z >= CENTER_MIN && z <= CENTER_MAX;
}

export function distanceFromCenterPlatform(x: number, z: number) {
  const dx = x < CENTER_MIN ? CENTER_MIN - x : x > CENTER_MAX ? x - CENTER_MAX : 0;
  const dz = z < CENTER_MIN ? CENTER_MIN - z : z > CENTER_MAX ? z - CENTER_MAX : 0;

  return Math.hypot(dx, dz);
}

export function createTerrainData(): TerrainData {
  const maxDistance = distanceFromCenterPlatform(0, 0);
  const chunks: TerrainChunk[] = [];
  const centerCells: TerrainCell[] = [];
  let index = 0;

  for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ += 1) {
    for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX += 1) {
      const cells: TerrainCell[] = [];

      for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
        for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
          const x = chunkX * CHUNK_SIZE + localX;
          const z = chunkZ * CHUNK_SIZE + localZ;
          const isCenter = isCenterLoaderCell(x, z);
          const distance = distanceFromCenterPlatform(x, z);
          const cell: TerrainCell = {
            index,
            x,
            y: 0,
            z,
            worldX: x - (TERRAIN_SIZE_X - 1) / 2,
            worldY: 0,
            worldZ: z - (TERRAIN_SIZE_Z - 1) / 2,
            expansionDelay: isCenter ? 0 : (distance / maxDistance) * MAX_WAVE_DELAY,
            variation: ((x * 37 + z * 17) % 100) / 100,
            isCenterLoaderBlock: isCenter,
          };

          cells.push(cell);
          if (isCenter) {
            centerCells.push(cell);
          }
          index += 1;
        }
      }

      chunks.push({
        id: `chunk-${chunkX}-${chunkZ}`,
        chunkX,
        chunkZ,
        cells,
      });
    }
  }

  return {
    chunks,
    centerCells,
    instanceCount: index,
  };
}
