import { voxelColumnStandable } from "@/lib/navigation/voxel-standable";
import { getTerrainSurfaceAt } from "@/lib/world/surface-query";
import { GROUND_UNITS, NO_GROUND } from "@/lib/engine/world-query";
import { createLoadedMapState, type MapDefinition } from "@/lib/maps/map-definition";
import { buildSurfaceChunkMesh, collectSurfaceCells } from "@/lib/terrain/surface-mesher";
import type { SurfaceCell } from "@/lib/terrain/surface-faces";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import { getChunkCounts } from "@/lib/world/world-config";
import {
  BAKE_FORMAT_VERSION,
  BakedDataWriter,
  toRuntimeMap,
  type BakedHeader,
  type BakedTile,
  type BakedVoxelZone,
  type BakeStats,
  type GridRegion,
} from "./baked-format";

/**
 * Bakes a voxel map into the static world a visitor loads.
 *
 * Nothing is reshaped or simplified: the bake records which faces of which
 * cells the live mesher would draw, and the browser writes exactly those
 * faces (see baked-format.ts). What it saves the browser is building the
 * voxel world and testing every face against its neighbours.
 *
 * - Faces are grouped into tiles of TILE_CHUNKS x TILE_CHUNKS chunks, one
 *   mesh each, for fewer draw calls.
 * - Columns of mini-game zones, with a ring around them, stay live voxels:
 *   their voxels are stored instead of their faces (BakedVoxelZone).
 * - A height and a zone id per column replace the voxel world for picking.
 *
 * The same function runs in Node (`pnpm bake`, the editor's bake endpoint)
 * and in the browser (the editor's baked preview).
 */
export const TILE_CHUNKS = 4;

export type BakeResult = { file: Uint8Array; header: BakedHeader };

export async function bakeMap(definition: MapDefinition): Promise<BakeResult> {
  const startedAt = performance.now();
  const { world } = createLoadedMapState(definition);
  const { width, depth, minY, chunkSize } = world.config;

  const voxelZones = definition.zones
    .filter((zone) => zone.kind === "minigame")
    .flatMap((zone) => zoneRegions(world, zone.numericId));
  const live = (x: number, z: number) => voxelZones.some(({ live: region }) => x >= region.minX && x <= region.maxX && z >= region.minZ && z <= region.maxZ);

  // Cells tile by tile, chunk by chunk inside each tile: a tile's cells are contiguous.
  const counts = getChunkCounts(world.config);
  const cells: SurfaceCell[] = [];
  const tiles: BakedTile[] = [];
  let sourceFaces = 0;
  for (let tileZ = 0; tileZ < counts.z; tileZ += TILE_CHUNKS) {
    for (let tileX = 0; tileX < counts.x; tileX += TILE_CHUNKS) {
      const cellStart = cells.length;
      for (let chunkZ = tileZ; chunkZ < Math.min(counts.z, tileZ + TILE_CHUNKS); chunkZ += 1) {
        for (let chunkX = tileX; chunkX < Math.min(counts.x, tileX + TILE_CHUNKS); chunkX += 1) {
          const region = { minX: chunkX * chunkSize, maxX: chunkX * chunkSize + chunkSize - 1, minZ: chunkZ * chunkSize, maxZ: chunkZ * chunkSize + chunkSize - 1 };
          cells.push(...collectSurfaceCells(world, region, voxelZones.length > 0 ? (x, z) => !live(x, z) : undefined));
          sourceFaces += buildSurfaceChunkMesh(world, chunkX, chunkZ, { skipMappings: true, packed: true }).visibleQuads;
        }
      }
      if (cells.length > cellStart) tiles.push({ id: `tile-${tileX / TILE_CHUNKS}-${tileZ / TILE_CHUNKS}`, cellStart, cellCount: cells.length - cellStart });
    }
  }

  const writer = new BakedDataWriter();
  const column = <T extends Uint8Array | Uint16Array>(array: T, pick: (cell: SurfaceCell) => number) => {
    cells.forEach((cell, index) => { array[index] = pick(cell); });
    return writer.add(array);
  };
  const faceCount = cells.reduce((sum, cell) => sum + cell.faces.length, 0);
  const faces = new Uint8Array(faceCount);
  let at = 0;
  for (const cell of cells) for (const face of cell.faces) faces[at++] = face;

  const heights = new Int8Array(width * depth);
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const top = world.getHighestNonAirY(x, z);
      heights[x + width * z] = top === null ? -128 : top + 1;
    }
  }
  const grounds = new Int16Array(width * depth);
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const surface = getTerrainSurfaceAt(world, x, z);
      grounds[x + width * z] = surface.valid ? Math.round(surface.surfaceY * GROUND_UNITS) : NO_GROUND;
    }
  }
  const standable = new Uint8Array(width * depth);
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) standable[x + width * z] = voxelColumnStandable(world, x, z) ? 1 : 0;
  }

  const stats: BakeStats = { sourceFaces, faces: faceCount, cells: cells.length, tiles: tiles.length, bytes: 0, bakeMs: 0 };
  const header: BakedHeader = {
    format: BAKE_FORMAT_VERSION,
    map: toRuntimeMap(definition),
    config: world.config,
    cells: {
      count: cells.length,
      x: column(new Uint16Array(cells.length), (cell) => cell.x),
      y: column(new Uint8Array(cells.length), (cell) => cell.y - minY),
      z: column(new Uint16Array(cells.length), (cell) => cell.z),
      block: column(new Uint8Array(cells.length), (cell) => cell.blockId),
      shape: column(new Uint8Array(cells.length), (cell) => cell.shapeId),
      rotation: column(new Uint8Array(cells.length), (cell) => cell.rotation),
      state: column(new Uint8Array(cells.length), (cell) => cell.state),
      flags: column(new Uint8Array(cells.length), (cell) => cell.flags),
      faceCounts: column(new Uint8Array(cells.length), (cell) => cell.faces.length),
      faces: writer.add(faces),
    },
    tiles,
    heights: writer.add(heights),
    grounds: writer.add(grounds),
    standable: writer.add(standable),
    zones: writer.add(world.zones),
    voxelZones: voxelZones.map((zone) => writeVoxelZone(writer, world, zone)),
    stats,
  };
  // Two passes: the byte count is part of the header it describes.
  stats.bakeMs = Math.round(performance.now() - startedAt);
  stats.bytes = writer.finish(header).byteLength;
  stats.bytes = writer.finish(header).byteLength;
  return { file: writer.finish(header), header };
}

/** A zone's live and stored rectangles, clamped to the map. None when the zone has no columns. */
function zoneRegions(world: VoxelWorld, zoneId: number): Array<{ zoneId: number; live: GridRegion; stored: GridRegion }> {
  const { width, depth } = world.config;
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      if (world.zones[x + width * z] !== zoneId) continue;
      box.minX = Math.min(box.minX, x);
      box.maxX = Math.max(box.maxX, x);
      box.minZ = Math.min(box.minZ, z);
      box.maxZ = Math.max(box.maxZ, z);
    }
  }
  if (box.minX === Infinity) return [];
  const grow = (region: GridRegion, by: number): GridRegion => ({
    minX: Math.max(0, region.minX - by),
    maxX: Math.min(width - 1, region.maxX + by),
    minZ: Math.max(0, region.minZ - by),
    maxZ: Math.min(depth - 1, region.maxZ + by),
  });
  const live = grow(box, 1);
  return [{ zoneId, live, stored: grow(live, 1) }];
}

function writeVoxelZone(writer: BakedDataWriter, world: VoxelWorld, zone: { zoneId: number; live: GridRegion; stored: GridRegion }): BakedVoxelZone {
  const { width, depth, height } = world.config;
  const { stored } = zone;
  const nx = stored.maxX - stored.minX + 1;
  const nz = stored.maxZ - stored.minZ + 1;
  const count = nx * nz * height;
  const blocks = new Uint16Array(count);
  const shapes = new Uint8Array(count);
  const rotations = new Uint8Array(count);
  const states = new Uint8Array(count);
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    for (let z = stored.minZ; z <= stored.maxZ; z += 1) {
      for (let x = stored.minX; x <= stored.maxX; x += 1) {
        const index = x + width * (z + depth * y);
        blocks[at] = world.blocks[index];
        shapes[at] = world.shapes[index];
        rotations[at] = world.rotations[index];
        states[at] = world.states[index];
        at += 1;
      }
    }
  }
  return { ...zone, blocks: writer.add(blocks), shapes: writer.add(shapes), rotations: writer.add(rotations), states: writer.add(states) };
}
