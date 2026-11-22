import type { MapDefinition } from "@/lib/maps/map-definition";
import type { WorldConfig } from "@/lib/world/world-config";

/**
 * The baked world file: what a visitor's browser downloads instead of the
 * voxel map.
 *
 * A bake keeps the terrain exactly as it was authored: every cell, shape,
 * material and texture. What it stores is the result of the expensive half
 * of meshing, *which faces of which cells are visible*, so the browser only
 * writes those faces out (lib/terrain/surface-faces.ts, the same code the
 * live mesher uses) and never builds the voxel world or tests a neighbour.
 * Each vertex keeps its cell's centre and reveal delay, so the entry wave
 * plays over baked terrain exactly as over voxels.
 *
 * Layout: "BKW2" | uint32 header length | header JSON | padding to 4 bytes |
 * data. Every `BufferRef` is a byte range inside the data part; ranges start
 * on 4-byte boundaries so they can be viewed as typed arrays without copying.
 *
 * This module is the runtime side (types, encode, decode) and has no
 * dependencies beyond types, so the visitor bundle does not pull in the baker.
 */
/** 3: exact ground heights (grounds) and where creatures can stand (standable), per column. */
export const BAKE_FORMAT_VERSION = 3;
const MAGIC = 0x32574b42; // "BKW2", little-endian

/** The parts of a map the runtime needs once terrain is baked. A `MapDefinition` is also one of these. */
export type RuntimeMap = Pick<
  MapDefinition,
  "id" | "name" | "dimensions" | "playableBounds" | "environment" | "modelSettings" | "entities" | "markers" | "zones" | "spawnPoints" | "defaultSpawnId"
>;

export type BufferRef = { offset: number; length: number };

export type GridRegion = { minX: number; maxX: number; minZ: number; maxZ: number };

/**
 * Visible cells, in one set of parallel arrays for the whole map, ordered by
 * chunk. A cell's faces are the next `faceCounts[i]` entries of `faces`.
 */
export type BakedCells = {
  count: number;
  /** Uint16. */
  x: BufferRef;
  /** Uint8, y minus the world's lowest layer. */
  y: BufferRef;
  /** Uint16. */
  z: BufferRef;
  /** Uint8 each. */
  block: BufferRef;
  shape: BufferRef;
  rotation: BufferRef;
  state: BufferRef;
  /** Uint8: CELL_LOADER_PLATFORM | CELL_GRASS_COVERED (surface-faces.ts). */
  flags: BufferRef;
  /** Uint8: number of visible faces. */
  faceCounts: BufferRef;
  /** Uint8: indices into the cell's shape face list. */
  faces: BufferRef;
};

/** A square of chunks drawn as one mesh. */
export type BakedTile = {
  id: string;
  /** First cell of the tile; its cells follow contiguously. */
  cellStart: number;
  cellCount: number;
};

/**
 * A mini-game zone stays live voxels: its columns, and the ring of columns
 * around them, are left out of the baked faces, and their voxels are stored
 * so the runtime meshes them, and remeshes them as they change.
 */
export type BakedVoxelZone = {
  zoneId: number;
  /** Columns meshed live: the zone's bounding rectangle plus one column all round. */
  live: GridRegion;
  /** Columns stored: `live` plus one more, so faces on its edge are hidden exactly as in the whole world. */
  stored: GridRegion;
  /** Per stored cell, in VoxelWorld order restricted to `stored` (x fastest, then z, then y). Uint16 / Uint8. */
  blocks: BufferRef;
  shapes: BufferRef;
  rotations: BufferRef;
  states: BufferRef;
};

export type BakeStats = {
  /** Faces the live mesher draws for the same map. */
  sourceFaces: number;
  faces: number;
  cells: number;
  tiles: number;
  /** Size of the file before compression. */
  bytes: number;
  bakeMs: number;
};

export type BakedHeader = {
  format: typeof BAKE_FORMAT_VERSION;
  map: RuntimeMap;
  config: WorldConfig;
  cells: BakedCells;
  tiles: BakedTile[];
  /** Int8 per column (x + width * z): world-space height of the terrain surface, -128 where there is none. */
  heights: BufferRef;
  /** Int16 per column, in 1/64 of a block: where a creature stands (the exact surface at the column's centre); -32768 where there is none. */
  grounds: BufferRef;
  /** Uint8 per column: 1 where a creature can stand (docs/navigation.md), 0 elsewhere. */
  standable: BufferRef;
  /** Uint8 per column: numeric zone id, 0 for none. */
  zones: BufferRef;
  voxelZones: BakedVoxelZone[];
  stats: BakeStats;
};

export type BakedWorld = {
  header: BakedHeader;
  /** The data part of the file. `BufferRef`s index into this. */
  data: ArrayBuffer;
};

export function toRuntimeMap(map: MapDefinition): RuntimeMap {
  return {
    id: map.id,
    name: map.name,
    dimensions: map.dimensions,
    playableBounds: map.playableBounds,
    environment: map.environment,
    modelSettings: map.modelSettings,
    entities: map.entities,
    markers: map.markers,
    zones: map.zones,
    spawnPoints: map.spawnPoints,
    defaultSpawnId: map.defaultSpawnId,
  };
}

/** Collects buffers into one data block, 4-byte aligned, and hands out their ranges. */
export class BakedDataWriter {
  private readonly chunks: Uint8Array[] = [];
  private size = 0;

  add(array: ArrayBufferView): BufferRef {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const ref = { offset: this.size, length: bytes.byteLength };
    this.chunks.push(bytes);
    const padding = (4 - (bytes.byteLength % 4)) % 4;
    if (padding > 0) this.chunks.push(new Uint8Array(padding));
    this.size += bytes.byteLength + padding;
    return ref;
  }

  get byteLength() {
    return this.size;
  }

  finish(header: BakedHeader): Uint8Array {
    const json = new TextEncoder().encode(JSON.stringify(header));
    const headerPadding = (4 - (json.byteLength % 4)) % 4;
    const file = new Uint8Array(8 + json.byteLength + headerPadding + this.size);
    const view = new DataView(file.buffer);
    view.setUint32(0, MAGIC, true);
    view.setUint32(4, json.byteLength, true);
    file.set(json, 8);
    let offset = 8 + json.byteLength + headerPadding;
    for (const chunk of this.chunks) {
      file.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return file;
  }
}

export function decodeBakedWorld(file: ArrayBuffer): BakedWorld {
  const view = new DataView(file);
  if (file.byteLength < 8 || view.getUint32(0, true) !== MAGIC) throw new Error("Not a baked world file of this version. Run pnpm bake.");
  const jsonLength = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(file, 8, jsonLength))) as BakedHeader;
  if (header.format !== BAKE_FORMAT_VERSION) {
    throw new Error(`Baked world format ${String(header.format)} is not supported (expected ${BAKE_FORMAT_VERSION}). Run pnpm bake.`);
  }
  const dataStart = 8 + jsonLength + ((4 - (jsonLength % 4)) % 4);
  // A copy starting at 0, so every range is aligned whatever the header length was.
  return { header, data: file.slice(dataStart) };
}

export const bakedInt8 = (world: BakedWorld, ref: BufferRef) => new Int8Array(world.data, ref.offset, ref.length);
export const bakedUint8 = (world: BakedWorld, ref: BufferRef) => new Uint8Array(world.data, ref.offset, ref.length);
export const bakedUint16 = (world: BakedWorld, ref: BufferRef) => new Uint16Array(world.data, ref.offset, ref.length / 2);
export const bakedInt16 = (world: BakedWorld, ref: BufferRef) => new Int16Array(world.data, ref.offset, ref.length / 2);
