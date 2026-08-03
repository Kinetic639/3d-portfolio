import { BLOCK_IDS, type BlockId, isRenderableBlock } from "./block-registry";
import {
  DEFAULT_ROTATION,
  DEFAULT_SHAPE_ID,
  DEFAULT_STATE,
  normalizeRotation,
  normalizeShapeId,
  normalizeState,
  SHAPE_IDS,
  type CellRotation,
  type ShapeId,
} from "@/lib/voxel-shapes/shape-ids";
import {
  CHUNKS_PER_AXIS,
  CHUNK_SURFACE_CELL_COUNT,
  WORLD_AIR_CELL_COUNT,
  WORLD_CELL_COUNT,
  WORLD_CHUNK_COUNT,
  WORLD_CONFIG,
  WORLD_SURFACE_CELL_COUNT,
  type GridCoordinate,
  type WorldConfig,
  type WorldPosition,
} from "./world-config";

export type ChunkCoordinate = {
  chunkX: number;
  chunkZ: number;
};

export type LocalChunkCoordinate = {
  localX: number;
  localZ: number;
};

export type RenderableCell = GridCoordinate & {
  cellIndex: number;
  blockId: BlockId;
  shapeId: ShapeId;
  rotation: CellRotation;
  state: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  expansionDelay: number;
  variation: number;
  isCenterLoaderBlock: boolean;
};

export type VoxelCell = GridCoordinate & {
  blockId: BlockId;
  shapeId: ShapeId;
  rotation: CellRotation;
  state: number;
  zoneId: number;
};

export type RenderChunk = ChunkCoordinate & {
  id: string;
  bounds: {
    min: GridCoordinate;
    max: GridCoordinate;
  };
  renderableCells: RenderableCell[];
  instanceToCell: Uint32Array;
  cellToInstance: Map<number, number>;
  boundingBox: {
    min: WorldPosition;
    max: WorldPosition;
  };
};

export type WorldStats = {
  logicalCells: number;
  airCells: number;
  nonAirBlocks: number;
  zoneAssignments: number;
  renderedInstances: number;
  chunks: number;
};

const CENTER_MIN = WORLD_CONFIG.width / 2 - 1;
const CENTER_MAX = WORLD_CONFIG.width / 2;
const MAX_WAVE_DELAY = 0.74;

export class VoxelWorld {
  readonly config: WorldConfig;
  readonly blocks: Uint16Array;
  readonly zones: Uint8Array;
  readonly shapes: Uint8Array;
  readonly rotations: Uint8Array;
  readonly states: Uint8Array;
  readonly dirtyChunks = new Set<string>();

  constructor(
    config: WorldConfig = WORLD_CONFIG,
    blocks?: Uint16Array,
    zones?: Uint8Array,
    shapes?: Uint8Array,
    rotations?: Uint8Array,
    states?: Uint8Array,
  ) {
    this.config = config;
    const cellCount = config.width * config.depth * config.height;
    this.blocks = blocks ?? new Uint16Array(cellCount);
    this.zones = zones ?? new Uint8Array(cellCount);
    this.shapes = shapes ?? new Uint8Array(cellCount);
    this.rotations = rotations ?? new Uint8Array(cellCount);
    this.states = states ?? new Uint8Array(cellCount);
  }

  isInsideWorld(x: number, y: number, z: number) {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      Number.isInteger(z) &&
      x >= 0 &&
      x < this.config.width &&
      y >= 0 &&
      y < this.config.height &&
      z >= 0 &&
      z < this.config.depth
    );
  }

  getIndex(x: number, y: number, z: number) {
    if (!this.isInsideWorld(x, y, z)) {
      return null;
    }

    return x + this.config.width * (z + this.config.depth * y);
  }

  getCoordinates(index: number): GridCoordinate | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.blocks.length) {
      return null;
    }

    const yStride = this.config.width * this.config.depth;
    const y = Math.floor(index / yStride);
    const remainder = index - y * yStride;
    const z = Math.floor(remainder / this.config.width);
    const x = remainder - z * this.config.width;

    return { x, y, z };
  }

  getBlock(x: number, y: number, z: number): BlockId {
    const index = this.getIndex(x, y, z);

    if (index === null) {
      return BLOCK_IDS.Air;
    }

    return this.blocks[index] as BlockId;
  }

  getShape(x: number, y: number, z: number): ShapeId {
    const index = this.getIndex(x, y, z);
    if (index === null) return DEFAULT_SHAPE_ID;
    return normalizeShapeId(this.shapes[index]);
  }

  getRotation(x: number, y: number, z: number): CellRotation {
    const index = this.getIndex(x, y, z);
    if (index === null) return DEFAULT_ROTATION;
    return normalizeRotation(this.rotations[index]);
  }

  getState(x: number, y: number, z: number) {
    const index = this.getIndex(x, y, z);
    if (index === null) return DEFAULT_STATE;
    return normalizeState(this.states[index]);
  }

  getCell(x: number, y: number, z: number): VoxelCell | null {
    const index = this.getIndex(x, y, z);
    if (index === null) return null;
    return {
      x,
      y,
      z,
      blockId: this.blocks[index] as BlockId,
      shapeId: normalizeShapeId(this.shapes[index]),
      rotation: normalizeRotation(this.rotations[index]),
      state: normalizeState(this.states[index]),
      zoneId: this.zones[index],
    };
  }

  setBlock(x: number, y: number, z: number, blockId: BlockId) {
    const index = this.getIndex(x, y, z);

    if (index === null) {
      return false;
    }

    if (this.blocks[index] === blockId) {
      return true;
    }

    this.blocks[index] = blockId;
    if (blockId === BLOCK_IDS.Air) {
      this.shapes[index] = DEFAULT_SHAPE_ID;
      this.rotations[index] = DEFAULT_ROTATION;
      this.states[index] = DEFAULT_STATE;
    } else if (this.shapes[index] === SHAPE_IDS.WATER && blockId !== BLOCK_IDS.Water) {
      this.shapes[index] = DEFAULT_SHAPE_ID;
      this.states[index] = DEFAULT_STATE;
    }
    this.markChunkDirtyForCell(x, z);

    return true;
  }

  setShape(x: number, y: number, z: number, shapeId: ShapeId) {
    const index = this.getIndex(x, y, z);
    if (index === null) return false;
    const normalizedShape = normalizeShapeId(shapeId);
    if (this.blocks[index] === BLOCK_IDS.Air && normalizedShape !== DEFAULT_SHAPE_ID) return false;
    if (this.shapes[index] === normalizedShape) return true;
    this.shapes[index] = normalizedShape;
    this.markChunkDirtyForCell(x, z);
    return true;
  }

  setRotation(x: number, y: number, z: number, rotation: CellRotation) {
    const index = this.getIndex(x, y, z);
    if (index === null) return false;
    const normalizedRotation = normalizeRotation(rotation);
    if (this.rotations[index] === normalizedRotation) return true;
    this.rotations[index] = normalizedRotation;
    this.markChunkDirtyForCell(x, z);
    return true;
  }

  setState(x: number, y: number, z: number, state: number) {
    const index = this.getIndex(x, y, z);
    if (index === null) return false;
    const normalizedState = normalizeState(state);
    if (this.states[index] === normalizedState) return true;
    this.states[index] = normalizedState;
    this.markChunkDirtyForCell(x, z);
    return true;
  }

  setCell(cell: VoxelCell) {
    const index = this.getIndex(cell.x, cell.y, cell.z);
    if (index === null) return false;

    const blockId = cell.blockId;
    const shapeId = blockId === BLOCK_IDS.Air ? DEFAULT_SHAPE_ID : normalizeShapeId(cell.shapeId);
    const rotation = blockId === BLOCK_IDS.Air ? DEFAULT_ROTATION : normalizeRotation(cell.rotation);
    const state = blockId === BLOCK_IDS.Air ? DEFAULT_STATE : normalizeState(cell.state);
    const zoneId = Math.max(0, Math.min(255, Math.floor(cell.zoneId)));

    const changed = (
      this.blocks[index] !== blockId ||
      this.shapes[index] !== shapeId ||
      this.rotations[index] !== rotation ||
      this.states[index] !== state ||
      this.zones[index] !== zoneId
    );
    if (!changed) return true;

    this.blocks[index] = blockId;
    this.shapes[index] = shapeId;
    this.rotations[index] = rotation;
    this.states[index] = state;
    this.zones[index] = zoneId;
    this.markChunkDirtyForCell(cell.x, cell.z);
    return true;
  }

  getZone(x: number, y: number, z: number) {
    const index = this.getIndex(x, y, z);

    if (index === null) {
      return 0;
    }

    return this.zones[index];
  }

  setZone(x: number, y: number, z: number, zoneId: number) {
    const index = this.getIndex(x, y, z);

    if (index === null || !Number.isInteger(zoneId) || zoneId < 0 || zoneId > 255) {
      return false;
    }

    this.zones[index] = zoneId;

    return true;
  }

  getHighestNonAirY(x: number, z: number) {
    if (x < 0 || x >= this.config.width || z < 0 || z >= this.config.depth) {
      return null;
    }

    for (let y = this.config.height - 1; y >= 0; y -= 1) {
      if (this.getBlock(x, y, z) !== BLOCK_IDS.Air) {
        return y;
      }
    }

    return null;
  }

  gridToWorld(x: number, y: number, z: number): WorldPosition {
    return {
      x: (x - (this.config.width - 1) / 2) * this.config.blockSize,
      y: (y + 0.5) * this.config.blockSize,
      z: (z - (this.config.depth - 1) / 2) * this.config.blockSize,
    };
  }

  worldToGrid(position: WorldPosition): GridCoordinate | null {
    const x = Math.floor(position.x / this.config.blockSize + this.config.width / 2);
    const y = Math.floor(position.y / this.config.blockSize);
    const z = Math.floor(position.z / this.config.blockSize + this.config.depth / 2);

    if (!this.isInsideWorld(x, y, z)) {
      return null;
    }

    return { x, y, z };
  }

  getChunkCoordinates(x: number, z: number): ChunkCoordinate | null {
    if (x < 0 || x >= this.config.width || z < 0 || z >= this.config.depth) {
      return null;
    }

    return {
      chunkX: Math.floor(x / this.config.chunkSize),
      chunkZ: Math.floor(z / this.config.chunkSize),
    };
  }

  getLocalChunkCoordinates(x: number, z: number): LocalChunkCoordinate | null {
    if (x < 0 || x >= this.config.width || z < 0 || z >= this.config.depth) {
      return null;
    }

    return {
      localX: x % this.config.chunkSize,
      localZ: z % this.config.chunkSize,
    };
  }

  getChunkId(chunkX: number, chunkZ: number) {
    return `chunk-${chunkX}-${chunkZ}`;
  }

  markChunkDirtyForCell(x: number, z: number) {
    const chunk = this.getChunkCoordinates(x, z);

    if (!chunk) {
      return;
    }

    this.dirtyChunks.add(this.getChunkId(chunk.chunkX, chunk.chunkZ));

    if (x % this.config.chunkSize === 0 && chunk.chunkX > 0) {
      this.dirtyChunks.add(this.getChunkId(chunk.chunkX - 1, chunk.chunkZ));
    }

    if (x % this.config.chunkSize === this.config.chunkSize - 1 && chunk.chunkX < CHUNKS_PER_AXIS - 1) {
      this.dirtyChunks.add(this.getChunkId(chunk.chunkX + 1, chunk.chunkZ));
    }

    if (z % this.config.chunkSize === 0 && chunk.chunkZ > 0) {
      this.dirtyChunks.add(this.getChunkId(chunk.chunkX, chunk.chunkZ - 1));
    }

    if (z % this.config.chunkSize === this.config.chunkSize - 1 && chunk.chunkZ < CHUNKS_PER_AXIS - 1) {
      this.dirtyChunks.add(this.getChunkId(chunk.chunkX, chunk.chunkZ + 1));
    }
  }

  clearDirtyChunks() {
    this.dirtyChunks.clear();
  }

  getStats(): WorldStats {
    let nonAirBlocks = 0;
    let renderedInstances = 0;
    let zoneAssignments = 0;

    for (let index = 0; index < this.blocks.length; index += 1) {
      const blockId = this.blocks[index];
      if (blockId !== BLOCK_IDS.Air) {
        nonAirBlocks += 1;
      }
      if (isRenderableBlock(blockId)) {
        renderedInstances += 1;
      }
      if (this.zones[index] !== 0) {
        zoneAssignments += 1;
      }
    }

    return {
      logicalCells: this.blocks.length,
      airCells: this.blocks.length - nonAirBlocks,
      nonAirBlocks,
      zoneAssignments,
      renderedInstances,
      chunks: WORLD_CHUNK_COUNT,
    };
  }

  createRenderChunks(): RenderChunk[] {
    const chunks: RenderChunk[] = [];

    for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ += 1) {
      for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX += 1) {
        chunks.push(this.createRenderChunk(chunkX, chunkZ));
      }
    }

    return chunks;
  }

  rebuildDirtyChunks(): RenderChunk[] {
    const chunks = [...this.dirtyChunks].map((chunkId) => {
      const coordinates = this.getCoordinatesForChunkId(chunkId);

      if (!coordinates) {
        return null;
      }

      return this.createRenderChunk(coordinates.chunkX, coordinates.chunkZ);
    });

    this.clearDirtyChunks();

    return chunks.filter((chunk): chunk is RenderChunk => chunk !== null);
  }

  createRenderChunk(chunkX: number, chunkZ: number): RenderChunk {
    if (
      !Number.isInteger(chunkX) ||
      !Number.isInteger(chunkZ) ||
      chunkX < 0 ||
      chunkX >= CHUNKS_PER_AXIS ||
      chunkZ < 0 ||
      chunkZ >= CHUNKS_PER_AXIS
    ) {
      throw new RangeError(`Chunk coordinates out of bounds: ${chunkX}, ${chunkZ}`);
    }

    const renderableCells: RenderableCell[] = [];
    const cellToInstance = new Map<number, number>();
    const minGridX = chunkX * this.config.chunkSize;
    const minGridZ = chunkZ * this.config.chunkSize;
    const maxGridX = minGridX + this.config.chunkSize - 1;
    const maxGridZ = minGridZ + this.config.chunkSize - 1;

    for (let y = 0; y < this.config.height; y += 1) {
      for (let z = minGridZ; z <= maxGridZ; z += 1) {
        for (let x = minGridX; x <= maxGridX; x += 1) {
          const blockId = this.getBlock(x, y, z);
          if (!isRenderableBlock(blockId)) {
            continue;
          }

          const cellIndex = this.getIndex(x, y, z);
          if (cellIndex === null) {
            continue;
          }

          const worldPosition = this.gridToWorld(x, y, z);
          const instanceId = renderableCells.length;

          cellToInstance.set(cellIndex, instanceId);
          renderableCells.push({
            x,
            y,
            z,
            cellIndex,
            blockId,
            shapeId: this.getShape(x, y, z),
            rotation: this.getRotation(x, y, z),
            state: this.getState(x, y, z),
            worldX: worldPosition.x,
            worldY: worldPosition.y,
            worldZ: worldPosition.z,
            expansionDelay: this.isCenterLoaderCell(x, y, z)
              ? 0
              : (this.distanceFromCenterPlatform(x, z) / this.distanceFromCenterPlatform(0, 0)) * MAX_WAVE_DELAY,
            variation: ((x * 37 + z * 17 + y * 11) % 100) / 100,
            isCenterLoaderBlock: this.isCenterLoaderCell(x, y, z),
          });
        }
      }
    }

    const instanceToCell = new Uint32Array(renderableCells.length);
    renderableCells.forEach((cell, instanceId) => {
      instanceToCell[instanceId] = cell.cellIndex;
    });

    return {
      id: this.getChunkId(chunkX, chunkZ),
      chunkX,
      chunkZ,
      bounds: {
        min: { x: minGridX, y: 0, z: minGridZ },
        max: { x: maxGridX, y: this.config.height - 1, z: maxGridZ },
      },
      renderableCells,
      instanceToCell,
      cellToInstance,
      boundingBox: {
        min: this.gridToWorld(minGridX, 0, minGridZ),
        max: this.gridToWorld(maxGridX, this.config.height - 1, maxGridZ),
      },
    };
  }

  private isCenterLoaderCell(x: number, y: number, z: number) {
    return y === 0 && x >= CENTER_MIN && x <= CENTER_MAX && z >= CENTER_MIN && z <= CENTER_MAX;
  }

  private distanceFromCenterPlatform(x: number, z: number) {
    const dx = x < CENTER_MIN ? CENTER_MIN - x : x > CENTER_MAX ? x - CENTER_MAX : 0;
    const dz = z < CENTER_MIN ? CENTER_MIN - z : z > CENTER_MAX ? z - CENTER_MAX : 0;

    return Math.hypot(dx, dz);
  }

  private getCoordinatesForChunkId(chunkId: string): ChunkCoordinate | null {
    const match = /^chunk-(\d+)-(\d+)$/.exec(chunkId);

    if (!match) {
      return null;
    }

    const chunkX = Number(match[1]);
    const chunkZ = Number(match[2]);

    if (
      !Number.isInteger(chunkX) ||
      !Number.isInteger(chunkZ) ||
      chunkX < 0 ||
      chunkX >= CHUNKS_PER_AXIS ||
      chunkZ < 0 ||
      chunkZ >= CHUNKS_PER_AXIS
    ) {
      return null;
    }

    return { chunkX, chunkZ };
  }
}

export function createFlatVoxelWorld() {
  const world = new VoxelWorld();

  for (let z = 0; z < WORLD_CONFIG.depth; z += 1) {
    for (let x = 0; x < WORLD_CONFIG.width; x += 1) {
      world.setBlock(x, 0, z, BLOCK_IDS.Ground);
    }
  }

  world.clearDirtyChunks();

  return world;
}

export const EXPECTED_WORLD_STATS = {
  logicalCells: WORLD_CELL_COUNT,
  airCells: WORLD_AIR_CELL_COUNT,
  nonAirBlocks: WORLD_SURFACE_CELL_COUNT,
  renderedInstances: WORLD_SURFACE_CELL_COUNT,
  chunks: WORLD_CHUNK_COUNT,
  instancesPerFlatChunk: CHUNK_SURFACE_CELL_COUNT,
} as const;
