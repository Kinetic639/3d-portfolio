import { bakedInt16, bakedInt8, bakedUint8, type BakedWorld } from "@/lib/bake/baked-format";
import { createBakedTerrainSync, type TerrainSource } from "./terrain-meshes";
import { createHeightfieldQuery, type WorldQuery } from "./world-query";

/**
 * Picking and heights for a baked world: a height and a zone id per column
 * stand in for the voxel world. The columns are copied, so the file's data
 * can be handed to a worker afterwards.
 */
export function createBakedQuery(baked: BakedWorld): WorldQuery {
  const { width, depth } = baked.header.map.dimensions;
  return createHeightfieldQuery(width, depth, bakedInt8(baked, baked.header.heights).slice(), bakedUint8(baked, baked.header.zones).slice(), bakedInt16(baked, baked.header.grounds).slice());
}

/** The baked world as terrain, decoded on this thread (the editor's baked view). */
export function createBakedTerrain(baked: BakedWorld): TerrainSource {
  return createBakedTerrainSync(baked);
}
