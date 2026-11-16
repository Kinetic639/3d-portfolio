import { packEmitted, type TerrainChunkBuffers } from "@/lib/engine/terrain-chunk";
import { CELL_LOADER_PLATFORM, SurfaceEmitter, type SurfaceCell } from "@/lib/terrain/surface-faces";
import { collectSurfaceCells } from "@/lib/terrain/surface-mesher";
import { VoxelWorld } from "@/lib/world/voxel-world";
import { bakedUint16, bakedUint8, type BakedTile, type BakedVoxelZone, type BakedWorld } from "./baked-format";

/**
 * Baked world -> vertex buffers for the terrain material, without three.js:
 * runs in the world-builder worker for visitors and on the main thread in
 * the editor's baked view.
 *
 * Each tile's visible faces are written by the same SurfaceEmitter the live
 * mesher uses. The loader platform's cells go into a mesh of their own, so
 * the landing page's loader draws a few dozen vertices, not a whole tile.
 * Mini-game zones are meshed here from their stored voxels.
 */
export type BakedMesh = { id: string; buffers: TerrainChunkBuffers };

/** The visible cells of a tile, as the baker recorded them. */
export function readTileCells(baked: BakedWorld, tile: Pick<BakedTile, "cellStart" | "cellCount">): SurfaceCell[] {
  const { cells, config } = baked.header;
  const xs = bakedUint16(baked, cells.x);
  const ys = bakedUint8(baked, cells.y);
  const zs = bakedUint16(baked, cells.z);
  const blocks = bakedUint8(baked, cells.block);
  const shapes = bakedUint8(baked, cells.shape);
  const rotations = bakedUint8(baked, cells.rotation);
  const states = bakedUint8(baked, cells.state);
  const flags = bakedUint8(baked, cells.flags);
  const counts = bakedUint8(baked, cells.faceCounts);
  const faces = bakedUint8(baked, cells.faces);
  // Face lists are contiguous: the first face of the tile follows the faces of every earlier cell.
  let faceAt = 0;
  for (let index = 0; index < tile.cellStart; index += 1) faceAt += counts[index];
  const result: SurfaceCell[] = [];
  for (let index = tile.cellStart; index < tile.cellStart + tile.cellCount; index += 1) {
    const count = counts[index];
    result.push({
      x: xs[index],
      y: ys[index] + config.minY,
      z: zs[index],
      blockId: blocks[index],
      shapeId: shapes[index],
      rotation: rotations[index],
      state: states[index],
      flags: flags[index],
      faces: Array.from(faces.subarray(faceAt, faceAt + count)),
    });
    faceAt += count;
  }
  return result;
}

/** A voxel world holding only the stored columns of the map's mini-game zones; null when there are none. */
export function buildZoneWorld(baked: BakedWorld): VoxelWorld | null {
  const { voxelZones, config } = baked.header;
  if (voxelZones.length === 0) return null;
  const world = new VoxelWorld(config);
  const zones = bakedUint8(baked, baked.header.zones);
  world.zones.set(zones);
  for (const zone of voxelZones) writeZoneVoxels(baked, world, zone);
  return world;
}

function writeZoneVoxels(baked: BakedWorld, world: VoxelWorld, zone: BakedVoxelZone) {
  const { width, depth, height } = world.config;
  const blocks = bakedUint16(baked, zone.blocks);
  const shapes = bakedUint8(baked, zone.shapes);
  const rotations = bakedUint8(baked, zone.rotations);
  const states = bakedUint8(baked, zone.states);
  const { stored } = zone;
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    for (let z = stored.minZ; z <= stored.maxZ; z += 1) {
      for (let x = stored.minX; x <= stored.maxX; x += 1) {
        const index = x + width * (z + depth * y);
        world.blocks[index] = blocks[at];
        world.shapes[index] = shapes[at];
        world.rotations[index] = rotations[at];
        world.states[index] = states[at];
        at += 1;
      }
    }
  }
}

/** The live mesh of one mini-game zone, from a zone world (buildZoneWorld). */
export function meshVoxelZone(world: VoxelWorld, zone: Pick<BakedVoxelZone, "live">): TerrainChunkBuffers | null {
  const emitter = new SurfaceEmitter(world.config);
  for (const cell of collectSurfaceCells(world, zone.live)) emitter.emit(cell);
  return packEmitted(emitter);
}

/** Every mesh of a baked world: one per tile, the loader platform, and one per mini-game zone. */
export function decodeBakedMeshes(baked: BakedWorld, onTile?: (done: number, total: number) => void): BakedMesh[] {
  const { config, tiles, voxelZones } = baked.header;
  const meshes: BakedMesh[] = [];
  const loader = new SurfaceEmitter(config);
  tiles.forEach((tile, index) => {
    const emitter = new SurfaceEmitter(config);
    for (const cell of readTileCells(baked, tile)) {
      if (cell.flags & CELL_LOADER_PLATFORM) loader.emit(cell);
      else emitter.emit(cell);
    }
    const buffers = packEmitted(emitter);
    if (buffers) meshes.push({ id: tile.id, buffers });
    onTile?.(index + 1, tiles.length);
  });
  const loaderBuffers = packEmitted(loader);
  if (loaderBuffers) meshes.push({ id: "loader", buffers: loaderBuffers });
  const zoneWorld = buildZoneWorld(baked);
  if (zoneWorld) {
    for (const zone of voxelZones) {
      const buffers = meshVoxelZone(zoneWorld, zone);
      if (buffers) meshes.push({ id: `zone-${zone.zoneId}`, buffers });
    }
  }
  return meshes;
}
