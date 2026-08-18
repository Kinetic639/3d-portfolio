import { BLOCK_IDS, type BlockId, isRenderableBlock } from "./block-registry";
import {
  DEFAULT_ROTATION,
  DEFAULT_SHAPE_ID,
  DEFAULT_STATE,
  normalizeRotation,
  normalizeShapeId,
  normalizeState,
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
import { computeExpansionDelay, isLoaderPlatformTopCell } from "./reveal";
import {
  EMPTY_FLUID_CELL,
  FLUID_FLAGS,
  FLUID_IDS,
  decodeFluidCell,
  encodeFluidFlags,
  isKnownFluidId,
  isValidFluidCell,
  type FluidCell,
  type FluidId,
  type FluidLayerSnapshot,
} from "@/lib/fluids/fluid-types";
import { canTerrainStateContainFluid } from "@/lib/fluids/fluid-containment";

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
  fluidCells: number;
  fluidSources: number;
  fallingFluidCells: number;
  renderedInstances: number;
  chunks: number;
};

const CENTER_MIN = WORLD_CONFIG.width / 2 - 1;
const CENTER_MAX = WORLD_CONFIG.width / 2;

export class VoxelWorld {
  readonly config: WorldConfig;
  readonly blocks: Uint16Array;
  readonly zones: Uint8Array;
  readonly shapes: Uint8Array;
  readonly rotations: Uint8Array;
  readonly states: Uint8Array;
  readonly fluidTypes: Uint8Array;
  readonly fluidLevels: Uint8Array;
  readonly fluidFlags: Uint8Array;
  readonly dirtyChunks = new Set<string>();
  readonly dirtyZoneChunks = new Set<string>();
  readonly dirtyFluidChunks = new Set<string>();

  constructor(
    config: WorldConfig = WORLD_CONFIG,
    blocks?: Uint16Array,
    zones?: Uint8Array,
    shapes?: Uint8Array,
    rotations?: Uint8Array,
    states?: Uint8Array,
    fluidTypes?: Uint8Array,
    fluidLevels?: Uint8Array,
    fluidFlags?: Uint8Array,
  ) {
    this.config = config;
    const cellCount = config.width * config.depth * config.height;
    const zoneCount = config.width * config.depth;
    this.blocks = blocks ?? new Uint16Array(cellCount);
    this.zones = normalizeZoneLayer(config, zones);
    this.shapes = shapes ?? new Uint8Array(cellCount);
    this.rotations = rotations ?? new Uint8Array(cellCount);
    this.states = states ?? new Uint8Array(cellCount);
    this.fluidTypes = normalizeFluidArray("type", fluidTypes, cellCount);
    this.fluidLevels = normalizeFluidArray("level", fluidLevels, cellCount);
    this.fluidFlags = normalizeFluidArray("flags", fluidFlags, cellCount);
    if (this.zones.length !== zoneCount) {
      throw new RangeError(`Zone layer must contain ${zoneCount} columns.`);
    }
    validateFluidArrays(this.fluidTypes, this.fluidLevels, this.fluidFlags, this.blocks, this.shapes);
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
      zoneId: this.getZone(x, y, z),
    };
  }

  getFluid(x: number, y: number, z: number): FluidCell {
    const index = this.getIndex(x, y, z);
    if (index === null) return { ...EMPTY_FLUID_CELL };
    return decodeFluidCell(this.fluidTypes[index], this.fluidLevels[index], this.fluidFlags[index]);
  }

  canContainFluid(x: number, y: number, z: number, fluidId: FluidId) {
    const index = this.getIndex(x, y, z);
    if (index === null || fluidId === FLUID_IDS.None || !isKnownFluidId(fluidId)) return false;
    return canTerrainStateContainFluid(
      this.blocks[index] as BlockId,
      normalizeShapeId(this.shapes[index]),
      fluidId,
    );
  }

  setFluid(x: number, y: number, z: number, fluid: FluidCell) {
    const index = this.getIndex(x, y, z);
    if (index === null || !isValidFluidCell(fluid)) return false;
    if (fluid.type !== FLUID_IDS.None && !this.canContainFluid(x, y, z, fluid.type)) return false;

    const nextFlags = encodeFluidFlags(fluid);
    if (
      this.fluidTypes[index] === fluid.type &&
      this.fluidLevels[index] === fluid.level &&
      this.fluidFlags[index] === nextFlags
    ) {
      return true;
    }

    this.fluidTypes[index] = fluid.type;
    this.fluidLevels[index] = fluid.level;
    this.fluidFlags[index] = nextFlags;
    this.markFluidChunkDirtyForCell(x, z);
    return true;
  }

  setFluidSource(x: number, y: number, z: number, fluidId: FluidId) {
    if (fluidId === FLUID_IDS.None) return false;
    return this.setFluid(x, y, z, { type: fluidId, level: 0, source: true, falling: false, authored: true });
  }

  clearFluid(x: number, y: number, z: number) {
    return this.setFluid(x, y, z, { ...EMPTY_FLUID_CELL });
  }

  cloneFluidLayer(): FluidLayerSnapshot {
    return {
      types: new Uint8Array(this.fluidTypes),
      levels: new Uint8Array(this.fluidLevels),
      flags: new Uint8Array(this.fluidFlags),
    };
  }

  restoreFluidLayer(snapshot: FluidLayerSnapshot) {
    validateFluidLayerSnapshot(snapshot, this.blocks, this.shapes);
    this.fluidTypes.set(snapshot.types);
    this.fluidLevels.set(snapshot.levels);
    this.fluidFlags.set(snapshot.flags);
    this.markAllFluidChunksDirty();
  }

  clone() {
    const cloned = new VoxelWorld(
      this.config,
      new Uint16Array(this.blocks),
      new Uint8Array(this.zones),
      new Uint8Array(this.shapes),
      new Uint8Array(this.rotations),
      new Uint8Array(this.states),
      this.fluidTypes,
      this.fluidLevels,
      this.fluidFlags,
    );
    this.dirtyChunks.forEach((chunkId) => cloned.dirtyChunks.add(chunkId));
    this.dirtyZoneChunks.forEach((chunkId) => cloned.dirtyZoneChunks.add(chunkId));
    this.dirtyFluidChunks.forEach((chunkId) => cloned.dirtyFluidChunks.add(chunkId));
    return cloned;
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
    }
    if (this.fluidTypes[index] !== FLUID_IDS.None && !this.canContainFluid(x, y, z, this.fluidTypes[index] as FluidId)) {
      this.clearFluid(x, y, z);
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
    if (this.fluidTypes[index] !== FLUID_IDS.None && !this.canContainFluid(x, y, z, this.fluidTypes[index] as FluidId)) {
      this.clearFluid(x, y, z);
    }
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
      this.getZone(cell.x, cell.y, cell.z) !== zoneId
    );
    if (!changed) return true;

    this.blocks[index] = blockId;
    this.shapes[index] = shapeId;
    this.rotations[index] = rotation;
    this.states[index] = state;
    if (this.fluidTypes[index] !== FLUID_IDS.None && !this.canContainFluid(cell.x, cell.y, cell.z, this.fluidTypes[index] as FluidId)) {
      this.clearFluid(cell.x, cell.y, cell.z);
    }
    this.setZone(cell.x, cell.y, cell.z, zoneId);
    this.markChunkDirtyForCell(cell.x, cell.z);
    return true;
  }

  getZone(x: number, y: number, z: number) {
    void y;
    const index = this.getZoneIndex(x, z);

    if (index === null) {
      return 0;
    }

    return this.zones[index];
  }

  setZone(x: number, y: number, z: number, zoneId: number) {
    void y;
    const index = this.getZoneIndex(x, z);

    if (index === null || !Number.isInteger(zoneId) || zoneId < 0 || zoneId > 255) {
      return false;
    }

    if (this.zones[index] === zoneId) {
      return true;
    }

    this.zones[index] = zoneId;
    this.markZoneChunkDirtyForColumn(x, z);

    return true;
  }

  getZoneIndex(x: number, z: number) {
    if (!Number.isInteger(x) || !Number.isInteger(z) || x < 0 || x >= this.config.width || z < 0 || z >= this.config.depth) {
      return null;
    }

    return x + this.config.width * z;
  }

  getZoneCoordinates(index: number): Pick<GridCoordinate, "x" | "z"> | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.zones.length) {
      return null;
    }

    const z = Math.floor(index / this.config.width);
    const x = index - z * this.config.width;
    return { x, z };
  }

  getColumnZone(x: number, z: number) {
    return this.getZone(x, 0, z);
  }

  setColumnZone(x: number, z: number, zoneId: number) {
    return this.setZone(x, 0, z, zoneId);
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

  markZoneChunkDirtyForColumn(x: number, z: number) {
    const chunk = this.getChunkCoordinates(x, z);
    if (!chunk) return;
    this.dirtyZoneChunks.add(this.getChunkId(chunk.chunkX, chunk.chunkZ));
  }

  clearDirtyZoneChunks() {
    this.dirtyZoneChunks.clear();
  }

  markFluidChunkDirtyForCell(x: number, z: number) {
    this.markChunkSetDirtyForCell(this.dirtyFluidChunks, x, z);
  }

  markAllFluidChunksDirty() {
    for (let chunkZ = 0; chunkZ < CHUNKS_PER_AXIS; chunkZ += 1) {
      for (let chunkX = 0; chunkX < CHUNKS_PER_AXIS; chunkX += 1) {
        this.dirtyFluidChunks.add(this.getChunkId(chunkX, chunkZ));
      }
    }
  }

  clearDirtyFluidChunks() {
    this.dirtyFluidChunks.clear();
  }

  getStats(): WorldStats {
    let nonAirBlocks = 0;
    let renderedInstances = 0;
    let zoneAssignments = 0;
    let fluidCells = 0;
    let fluidSources = 0;
    let fallingFluidCells = 0;

    for (let index = 0; index < this.blocks.length; index += 1) {
      const blockId = this.blocks[index];
      if (blockId !== BLOCK_IDS.Air) {
        nonAirBlocks += 1;
      }
      if (isRenderableBlock(blockId)) {
        renderedInstances += 1;
      }
      if (this.fluidTypes[index] !== FLUID_IDS.None) {
        fluidCells += 1;
        if ((this.fluidFlags[index] & FLUID_FLAGS.Source) !== 0) fluidSources += 1;
        if ((this.fluidFlags[index] & FLUID_FLAGS.Falling) !== 0) fallingFluidCells += 1;
      }
    }

    for (let index = 0; index < this.zones.length; index += 1) {
      if (this.zones[index] !== 0) {
        zoneAssignments += 1;
      }
    }

    return {
      logicalCells: this.blocks.length,
      airCells: this.blocks.length - nonAirBlocks,
      nonAirBlocks,
      zoneAssignments,
      fluidCells,
      fluidSources,
      fallingFluidCells,
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
            expansionDelay: computeExpansionDelay(this, x, y, z),
            variation: ((x * 37 + z * 17 + y * 11) % 100) / 100,
            isCenterLoaderBlock: isLoaderPlatformTopCell(this, x, y, z),
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

  private markChunkSetDirtyForCell(target: Set<string>, x: number, z: number) {
    const chunk = this.getChunkCoordinates(x, z);
    if (!chunk) return;

    target.add(this.getChunkId(chunk.chunkX, chunk.chunkZ));
    if (x % this.config.chunkSize === 0 && chunk.chunkX > 0) {
      target.add(this.getChunkId(chunk.chunkX - 1, chunk.chunkZ));
    }
    if (x % this.config.chunkSize === this.config.chunkSize - 1 && chunk.chunkX < CHUNKS_PER_AXIS - 1) {
      target.add(this.getChunkId(chunk.chunkX + 1, chunk.chunkZ));
    }
    if (z % this.config.chunkSize === 0 && chunk.chunkZ > 0) {
      target.add(this.getChunkId(chunk.chunkX, chunk.chunkZ - 1));
    }
    if (z % this.config.chunkSize === this.config.chunkSize - 1 && chunk.chunkZ < CHUNKS_PER_AXIS - 1) {
      target.add(this.getChunkId(chunk.chunkX, chunk.chunkZ + 1));
    }
  }
}

export function createFlatVoxelWorld() {
  const world = new VoxelWorld();

  for (let z = 0; z < WORLD_CONFIG.depth; z += 1) {
    for (let x = 0; x < WORLD_CONFIG.width; x += 1) {
      world.setBlock(x, 0, z, BLOCK_IDS.Ground);
    }
  }

  for (let z = CENTER_MIN; z <= CENTER_MAX; z += 1) {
    for (let x = CENTER_MIN; x <= CENTER_MAX; x += 1) {
      world.setBlock(x, 0, z, BLOCK_IDS.LoaderOrigin);
    }
  }

  world.clearDirtyChunks();

  return world;
}

function normalizeZoneLayer(config: WorldConfig, zones?: Uint8Array) {
  const columnCount = config.width * config.depth;
  const cellCount = columnCount * config.height;
  if (!zones) return new Uint8Array(columnCount);
  if (zones.length === columnCount) return new Uint8Array(zones);
  if (zones.length !== cellCount) {
    throw new RangeError(`Zone array must contain ${columnCount} columns or ${cellCount} legacy cells.`);
  }

  const columns = new Uint8Array(columnCount);
  for (let y = 0; y < config.height; y += 1) {
    for (let z = 0; z < config.depth; z += 1) {
      for (let x = 0; x < config.width; x += 1) {
        const legacyIndex = x + config.width * (z + config.depth * y);
        const zoneId = zones[legacyIndex];
        if (zoneId !== 0) {
          columns[x + config.width * z] = zoneId;
        }
      }
    }
  }
  return columns;
}

function normalizeFluidArray(name: string, values: Uint8Array | undefined, cellCount: number) {
  if (!values) return new Uint8Array(cellCount);
  if (values.length !== cellCount) {
    throw new RangeError(`Fluid ${name} array must contain ${cellCount} cells.`);
  }
  return new Uint8Array(values);
}

function validateFluidArrays(
  types: Uint8Array,
  levels: Uint8Array,
  flags: Uint8Array,
  blocks?: Uint16Array,
  shapes?: Uint8Array,
) {
  for (let index = 0; index < types.length; index += 1) {
    const cell = decodeFluidCell(types[index], levels[index], flags[index]);
    const emptyCellHasData = types[index] === FLUID_IDS.None && (levels[index] !== 0 || flags[index] !== 0);
    const invalidContainment = blocks && shapes && types[index] !== FLUID_IDS.None && !canTerrainStateContainFluid(
      blocks[index] as BlockId,
      normalizeShapeId(shapes[index]),
      types[index] as FluidId,
    );
    if (
      !isKnownFluidId(types[index]) ||
      emptyCellHasData ||
      !isValidFluidCell(cell) ||
      flags[index] > (FLUID_FLAGS.Source | FLUID_FLAGS.Falling | FLUID_FLAGS.Authored) ||
      invalidContainment
    ) {
      throw new RangeError(`Invalid fluid state at cell index ${index}.`);
    }
  }
}

function validateFluidLayerSnapshot(snapshot: FluidLayerSnapshot, blocks: Uint16Array, shapes: Uint8Array) {
  const cellCount = blocks.length;
  if (snapshot.types.length !== cellCount || snapshot.levels.length !== cellCount || snapshot.flags.length !== cellCount) {
    throw new RangeError(`Fluid snapshot arrays must contain ${cellCount} cells.`);
  }
  validateFluidArrays(snapshot.types, snapshot.levels, snapshot.flags, blocks, shapes);
}

export const EXPECTED_WORLD_STATS = {
  logicalCells: WORLD_CELL_COUNT,
  airCells: WORLD_AIR_CELL_COUNT,
  nonAirBlocks: WORLD_SURFACE_CELL_COUNT,
  renderedInstances: WORLD_SURFACE_CELL_COUNT,
  fluidCells: 0,
  fluidSources: 0,
  fallingFluidCells: 0,
  chunks: WORLD_CHUNK_COUNT,
  instancesPerFlatChunk: CHUNK_SURFACE_CELL_COUNT,
} as const;
