import type { MapDefinition } from "@/lib/maps/map-definition";
import type { GridRegion } from "./smooth-mesher";

/**
 * The baked world file: what a visitor's browser downloads instead of the
 * voxel map.
 *
 * Layout: "BKW1" | uint32 header length | header JSON | padding to 4 bytes |
 * data. Every `BufferRef` is a byte range inside the data part; ranges start
 * on 4-byte boundaries so they can be viewed as typed arrays without copying.
 *
 * This module is the runtime side (types, encode, decode) and has no
 * dependencies beyond types, so the visitor bundle does not pull in the
 * baker or its simplifier.
 */
export const BAKE_FORMAT_VERSION = 1;
const MAGIC = 0x31574b42; // "BKW1", little-endian

/** The parts of a map the runtime needs once terrain is baked. A `MapDefinition` is also one of these. */
export type RuntimeMap = Pick<
  MapDefinition,
  "id" | "name" | "dimensions" | "playableBounds" | "environment" | "entities" | "markers" | "zones" | "spawnPoints" | "defaultSpawnId"
>;

export type BufferRef = { offset: number; length: number };

export type BakedMeshInfo = {
  id: string;
  region: "playable" | "backdrop";
  vertexCount: number;
  indexCount: number;
  /** Float32 x 3. */
  positions: BufferRef;
  /** Int8 x 3, normalised. */
  normals: BufferRef;
  /** Uint8 x 3, sRGB. */
  colors: BufferRef;
  /** Uint16 when the mesh has at most 65 535 vertices, otherwise Uint32. */
  indices: BufferRef;
  bounds: { min: [number, number, number]; max: [number, number, number] };
};

/** A mini-game zone's voxels, stored as the input of the smooth mesher so the zone can be re-meshed while it changes. */
export type BakedVoxelZone = {
  zoneId: number;
  /** Bounding rectangle of the zone's columns. */
  region: GridRegion;
  volume: { nx: number; ny: number; nz: number; cellX: number; cellY: number; cellZ: number };
  /** Uint8: density x 255. */
  density: BufferRef;
  /** Uint16 block ids. */
  material: BufferRef;
};

export type BakeStats = {
  sourceTriangles: number;
  playableTriangles: number;
  backdropTriangles: number;
  vertices: number;
  meshes: number;
  bytes: number;
  bakeMs: number;
};

export type BakedHeader = {
  format: typeof BAKE_FORMAT_VERSION;
  map: RuntimeMap;
  meshes: BakedMeshInfo[];
  /** Int8 per column (x + width * z): world-space height of the terrain surface, -128 where there is none. */
  heights: BufferRef;
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
  if (file.byteLength < 8 || view.getUint32(0, true) !== MAGIC) throw new Error("Not a baked world file.");
  const jsonLength = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(file, 8, jsonLength))) as BakedHeader;
  if (header.format !== BAKE_FORMAT_VERSION) {
    throw new Error(`Baked world format ${String(header.format)} is not supported (expected ${BAKE_FORMAT_VERSION}). Run pnpm bake.`);
  }
  const dataStart = 8 + jsonLength + ((4 - (jsonLength % 4)) % 4);
  // A copy starting at 0, so every range is aligned whatever the header length was.
  return { header, data: file.slice(dataStart) };
}

export const bakedFloat32 = (world: BakedWorld, ref: BufferRef) => new Float32Array(world.data, ref.offset, ref.length / 4);
export const bakedInt8 = (world: BakedWorld, ref: BufferRef) => new Int8Array(world.data, ref.offset, ref.length);
export const bakedUint8 = (world: BakedWorld, ref: BufferRef) => new Uint8Array(world.data, ref.offset, ref.length);
export const bakedUint16 = (world: BakedWorld, ref: BufferRef) => new Uint16Array(world.data, ref.offset, ref.length / 2);
export const bakedUint32 = (world: BakedWorld, ref: BufferRef) => new Uint32Array(world.data, ref.offset, ref.length / 4);
