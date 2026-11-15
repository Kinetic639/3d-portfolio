import { MeshoptSimplifier } from "meshoptimizer";
import { createLoadedMapState, type MapDefinition } from "@/lib/maps/map-definition";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import {
  BAKE_FORMAT_VERSION,
  BakedDataWriter,
  toRuntimeMap,
  type BakedHeader,
  type BakedMeshInfo,
  type BakedVoxelZone,
  type BakeStats,
} from "./baked-format";
import { buildDensityVolume, buildSmoothSurface, filterSurface, type GridRegion, type SmoothSurface } from "./smooth-mesher";

/**
 * Bakes a voxel map into the static world a visitor loads.
 *
 * - The whole map is meshed once into a smooth surface.
 * - It is cut into the playable area (plus a ring around it) and the
 *   backdrop. Each part is simplified on its own, with its open borders
 *   locked, so the parts still meet without gaps. The backdrop tolerates a
 *   much larger error: it is never seen up close.
 * - Columns of mini-game zones are left out of the static mesh. Their voxels
 *   are stored instead, and the runtime meshes them with the same mesher, so
 *   they look like the terrain around them and can still change.
 * - A height and a zone id per column replace the voxel world for picking.
 *
 * The same function runs in Node (`pnpm bake`, the editor's bake endpoint)
 * and in the browser (the editor's baked preview).
 */
export type BakeOptions = {
  /** Blur passes before meshing. More is smoother and loses more small detail. */
  smoothing?: number;
  /** Largest deviation, in world units, simplification may introduce in the playable area. */
  playableError?: number;
  backdropError?: number;
  /** Cells around the playable area that keep playable-area quality. */
  playableMargin?: number;
};

export const DEFAULT_BAKE_OPTIONS: Required<BakeOptions> = {
  smoothing: 1,
  playableError: 0.02,
  backdropError: 0.35,
  playableMargin: 8,
};

const PLAYABLE_TILE = 32;
const BACKDROP_TILE = 64;
const srgbFromLinear = (value: number) => (value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055);

export type BakeResult = { file: Uint8Array; header: BakedHeader };

export async function bakeMap(definition: MapDefinition, options: BakeOptions = {}): Promise<BakeResult> {
  const startedAt = performance.now();
  const settings = { ...DEFAULT_BAKE_OPTIONS, ...options };
  await MeshoptSimplifier.ready;

  const { world } = createLoadedMapState(definition);
  const { width, depth } = world.config;
  const whole: GridRegion = { minX: 0, maxX: width - 1, minZ: 0, maxZ: depth - 1 };
  const surface = buildSmoothSurface(world, whole, { blur: settings.smoothing });

  const voxelZoneIds = new Set(definition.zones.filter((zone) => zone.kind === "minigame").map((zone) => zone.numericId));
  const isVoxelColumn = (x: number, z: number) => voxelZoneIds.size > 0 && voxelZoneIds.has(world.zones[x + width * z]);
  const bounds = definition.playableBounds;
  const margin = settings.playableMargin;
  const isPlayable = (x: number, z: number) =>
    x >= bounds.minX - margin && x <= bounds.maxX + margin && z >= bounds.minZ - margin && z <= bounds.maxZ + margin;

  const playable = simplify(filterSurface(surface, (x, z) => !isVoxelColumn(x, z) && isPlayable(x, z)), settings.playableError);
  const backdrop = simplify(filterSurface(surface, (x, z) => !isVoxelColumn(x, z) && !isPlayable(x, z)), settings.backdropError);

  const writer = new BakedDataWriter();
  const meshes: BakedMeshInfo[] = [
    ...writeTiles(writer, playable, "playable", PLAYABLE_TILE),
    ...writeTiles(writer, backdrop, "backdrop", BACKDROP_TILE),
  ];

  const heights = new Int8Array(width * depth);
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const top = world.getHighestNonAirY(x, z);
      heights[x + width * z] = top === null ? -128 : top + 1;
    }
  }

  const stats: BakeStats = {
    sourceTriangles: surface.indices.length / 3,
    playableTriangles: playable.indices.length / 3,
    backdropTriangles: backdrop.indices.length / 3,
    vertices: meshes.reduce((sum, mesh) => sum + mesh.vertexCount, 0),
    meshes: meshes.length,
    bytes: 0,
    bakeMs: 0,
  };
  const header: BakedHeader = {
    format: BAKE_FORMAT_VERSION,
    map: toRuntimeMap(definition),
    meshes,
    heights: writer.add(heights),
    zones: writer.add(world.zones),
    voxelZones: [...voxelZoneIds].flatMap((zoneId) => writeVoxelZone(writer, world, zoneId)),
    stats,
  };
  // Two passes: the byte count is part of the header it describes.
  stats.bakeMs = Math.round(performance.now() - startedAt);
  stats.bytes = writer.finish(header).byteLength;
  stats.bytes = writer.finish(header).byteLength;
  return { file: writer.finish(header), header };
}

function simplify(surface: SmoothSurface, maxError: number): SmoothSurface {
  if (surface.indices.length === 0) return surface;
  const vertexCount = surface.positions.length / 3;
  // Normals and colours take part in the error, so material edges and creases survive.
  const attributes = new Float32Array(vertexCount * 6);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      attributes[vertex * 6 + axis] = surface.normals[vertex * 3 + axis];
      attributes[vertex * 6 + 3 + axis] = srgbFromLinear(surface.colors[vertex * 3 + axis]);
    }
  }
  const [indices] = MeshoptSimplifier.simplifyWithAttributes(
    surface.indices,
    surface.positions,
    3,
    attributes,
    6,
    [0.5, 0.5, 0.5, 8, 8, 8],
    null,
    0,
    maxError,
    ["LockBorder", "ErrorAbsolute"],
  );
  return compact({ ...surface, indices, triangleColumnX: new Int16Array(0), triangleColumnZ: new Int16Array(0) });
}

/** Drops vertices no triangle uses. */
function compact(surface: SmoothSurface): SmoothSurface {
  const remap = new Int32Array(surface.positions.length / 3).fill(-1);
  const order: number[] = [];
  const indices = new Uint32Array(surface.indices.length);
  for (let n = 0; n < indices.length; n += 1) {
    const vertex = surface.indices[n];
    if (remap[vertex] === -1) {
      remap[vertex] = order.length;
      order.push(vertex);
    }
    indices[n] = remap[vertex];
  }
  const pick = (source: Float32Array) => {
    const target = new Float32Array(order.length * 3);
    order.forEach((vertex, index) => target.set(source.subarray(vertex * 3, vertex * 3 + 3), index * 3));
    return target;
  };
  return { ...surface, positions: pick(surface.positions), normals: pick(surface.normals), colors: pick(surface.colors), indices };
}

/** Cuts a surface into square tiles by triangle centroid, so the renderer can cull what is off screen. */
function writeTiles(writer: BakedDataWriter, surface: SmoothSurface, region: BakedMeshInfo["region"], tileSize: number): BakedMeshInfo[] {
  const buckets = new Map<string, number[]>();
  const p = surface.positions;
  for (let triangle = 0; triangle < surface.indices.length / 3; triangle += 1) {
    const [a, b, c] = [0, 1, 2].map((n) => surface.indices[triangle * 3 + n] * 3);
    const key = `${Math.floor((p[a] + p[b] + p[c]) / 3 / tileSize)},${Math.floor((p[a + 2] + p[b + 2] + p[c + 2]) / 3 / tileSize)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(triangle);
    else buckets.set(key, [triangle]);
  }

  return [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, triangles]) => {
    const tile = compact({
      ...surface,
      indices: Uint32Array.from(triangles.flatMap((triangle) => [0, 1, 2].map((n) => surface.indices[triangle * 3 + n]))),
    });
    const vertexCount = tile.positions.length / 3;
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    const normals = new Int8Array(vertexCount * 3);
    const colors = new Uint8Array(vertexCount * 3);
    for (let n = 0; n < vertexCount * 3; n += 1) {
      const axis = n % 3;
      min[axis] = Math.min(min[axis], tile.positions[n]);
      max[axis] = Math.max(max[axis], tile.positions[n]);
      normals[n] = Math.round(Math.max(-1, Math.min(1, tile.normals[n])) * 127);
      colors[n] = Math.round(Math.max(0, Math.min(1, srgbFromLinear(tile.colors[n]))) * 255);
    }
    return {
      id: `${region}:${key}`,
      region,
      vertexCount,
      indexCount: tile.indices.length,
      positions: writer.add(tile.positions),
      normals: writer.add(normals),
      colors: writer.add(colors),
      indices: writer.add(vertexCount <= 65535 ? Uint16Array.from(tile.indices) : tile.indices),
      bounds: { min, max },
    };
  });
}

function writeVoxelZone(writer: BakedDataWriter, world: VoxelWorld, zoneId: number): BakedVoxelZone[] {
  const { width, depth } = world.config;
  const region: GridRegion = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      if (world.zones[x + width * z] !== zoneId) continue;
      region.minX = Math.min(region.minX, x);
      region.maxX = Math.max(region.maxX, x);
      region.minZ = Math.min(region.minZ, z);
      region.maxZ = Math.max(region.maxZ, z);
    }
  }
  if (region.minX === Infinity) return [];
  const volume = buildDensityVolume(world, region);
  const density = new Uint8Array(volume.density.length);
  for (let index = 0; index < density.length; index += 1) density[index] = Math.round(volume.density[index] * 255);
  return [{
    zoneId,
    region,
    volume: { nx: volume.nx, ny: volume.ny, nz: volume.nz, cellX: volume.cellX, cellY: volume.cellY, cellZ: volume.cellZ },
    density: writer.add(density),
    material: writer.add(volume.material),
  }];
}
