import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { createFlatVoxelWorld } from "@/lib/world/voxel-world";
import { createTerrainMutations, getBrushFootprint, getDirtyChunkIdsForMutations } from "./terrain-brushes";

describe("terrain brushes", () => {
  it("calculates square, circular and clipped brush footprints", () => {
    expect(getBrushFootprint({ x: 10, y: 0, z: 10 }, { shape: "square", size: 3, pathWidth: 1, pathEnds: "square", flattenHeight: 0 })).toHaveLength(9);
    expect(getBrushFootprint({ x: 10, y: 0, z: 10 }, { shape: "circle", size: 3, pathWidth: 1, pathEnds: "square", flattenHeight: 0 })).toHaveLength(5);
    expect(getBrushFootprint({ x: 0, y: 0, z: 0 }, { shape: "square", size: 3, pathWidth: 1, pathEnds: "square", flattenHeight: 0 })).toHaveLength(4);
  });

  it("creates raise, lower, flatten and path-width mutations", () => {
    const world = createFlatVoxelWorld();
    const raise = createTerrainMutations({
      world,
      operation: "raise",
      center: { x: 12, y: 0, z: 12 },
      blockId: BLOCK_IDS.ZoneGround,
      zoneId: 1,
    });
    expect(raise).toMatchObject([{ coordinate: { x: 12, y: 1, z: 12 }, beforeBlock: BLOCK_IDS.Air, afterBlock: BLOCK_IDS.ZoneGround }]);

    world.setBlock(12, 1, 12, BLOCK_IDS.ZoneGround);
    const lower = createTerrainMutations({
      world,
      operation: "lower",
      center: { x: 12, y: 0, z: 12 },
      blockId: BLOCK_IDS.ZoneGround,
      zoneId: 1,
    });
    expect(lower).toMatchObject([{ coordinate: { x: 12, y: 1, z: 12 }, afterBlock: BLOCK_IDS.Air }]);

    const path = createTerrainMutations({
      world,
      operation: "paint-path",
      center: { x: 20, y: 0, z: 20 },
      settings: { pathWidth: 3 },
      blockId: BLOCK_IDS.Path,
      zoneId: 1,
    });
    expect(path).toHaveLength(9);
  });

  it("reports only affected dirty chunks including boundary neighbours", () => {
    const world = createFlatVoxelWorld();
    const mutations = createTerrainMutations({
      world,
      operation: "fill",
      center: { x: 15, y: 1, z: 15 },
      blockId: BLOCK_IDS.Special,
      zoneId: 1,
    });
    expect(getDirtyChunkIdsForMutations(world, mutations)).toEqual(["chunk-0-0", "chunk-0-1", "chunk-1-0"]);
  });
});
