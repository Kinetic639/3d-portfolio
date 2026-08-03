import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { createFlatVoxelWorld } from "@/lib/world/voxel-world";
import { ROTATIONS, SHAPE_IDS } from "@/lib/voxel-shapes/shape-ids";
import { createTerrainMutations, getBrushFootprint, getDirtyChunkIdsForMutations, getTerrainOperationFootprint } from "./terrain-brushes";

describe("terrain brushes", () => {
  it("calculates square, circular and clipped brush footprints", () => {
    expect(getBrushFootprint({ x: 10, y: 0, z: 10 }, { shape: "square", size: 3, pathWidth: 1, pathEnds: "square", flattenHeight: 0 })).toHaveLength(9);
    expect(getBrushFootprint({ x: 10, y: 0, z: 10 }, { shape: "circle", size: 3, pathWidth: 1, pathEnds: "square", flattenHeight: 0 })).toHaveLength(5);
    expect(getBrushFootprint({ x: 0, y: 0, z: 0 }, { shape: "square", size: 3, pathWidth: 1, pathEnds: "square", flattenHeight: 0 })).toHaveLength(4);
  });

  it("uses operation-specific footprints for previews and mutations", () => {
    const settings = { shape: "circle" as const, size: 5, pathWidth: 3, pathEnds: "square" as const, flattenHeight: 0 };

    expect(getTerrainOperationFootprint({ x: 10, y: 0, z: 10 }, "paint", settings)).toHaveLength(13);
    expect(getTerrainOperationFootprint({ x: 10, y: 0, z: 10 }, "paint-path", settings)).toHaveLength(9);
  });

  it("paints the selected shape onto existing terrain cells", () => {
    const world = createFlatVoxelWorld();
    const [mutation] = createTerrainMutations({
      world,
      operation: "paint",
      center: { x: 10, y: 0, z: 10 },
      blockId: BLOCK_IDS.Ground,
      shapeId: SHAPE_IDS.CRYSTAL_MEDIUM,
      rotation: ROTATIONS.EAST,
      state: 0,
      zoneId: 0,
    });

    expect(mutation).toMatchObject({
      coordinate: { x: 10, y: 0, z: 10 },
      beforeShape: SHAPE_IDS.CUBE,
      afterShape: SHAPE_IDS.CRYSTAL_MEDIUM,
      afterRotation: ROTATIONS.EAST,
    });
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

  it("supports shaped raise and lower brush footprints", () => {
    const world = createFlatVoxelWorld();
    const settings = { shape: "circle" as const, size: 3, pathWidth: 1, pathEnds: "square" as const, flattenHeight: 0 };
    const raise = createTerrainMutations({
      world,
      operation: "raise",
      center: { x: 12, y: 0, z: 12 },
      settings,
      blockId: BLOCK_IDS.ZoneGround,
      zoneId: 1,
    });
    expect(raise).toHaveLength(5);
    for (const mutation of raise) {
      world.setBlock(mutation.coordinate.x, mutation.coordinate.y, mutation.coordinate.z, mutation.afterBlock);
    }

    const lower = createTerrainMutations({
      world,
      operation: "lower",
      center: { x: 12, y: 0, z: 12 },
      settings,
      blockId: BLOCK_IDS.ZoneGround,
      zoneId: 1,
    });
    expect(lower).toHaveLength(5);
    expect(lower.every((mutation) => mutation.afterBlock === BLOCK_IDS.Air)).toBe(true);
  });

  it("targets each column height for shaped raise and lower brushes", () => {
    const world = createFlatVoxelWorld();
    world.setBlock(12, 1, 12, BLOCK_IDS.Ground);
    world.setBlock(13, 1, 12, BLOCK_IDS.Ground);
    world.setBlock(13, 2, 12, BLOCK_IDS.Ground);
    const settings = { shape: "square" as const, size: 3, pathWidth: 1, pathEnds: "square" as const, flattenHeight: 0 };

    const raise = createTerrainMutations({
      world,
      operation: "raise",
      center: { x: 12, y: 0, z: 12 },
      settings,
      blockId: BLOCK_IDS.ZoneGround,
      zoneId: 1,
    });
    expect(raise.find((mutation) => mutation.coordinate.x === 12 && mutation.coordinate.z === 12)?.coordinate.y).toBe(2);
    expect(raise.find((mutation) => mutation.coordinate.x === 13 && mutation.coordinate.z === 12)?.coordinate.y).toBe(3);

    const lower = createTerrainMutations({
      world,
      operation: "lower",
      center: { x: 12, y: 0, z: 12 },
      settings,
      blockId: BLOCK_IDS.ZoneGround,
      zoneId: 1,
    });
    expect(lower.find((mutation) => mutation.coordinate.x === 12 && mutation.coordinate.z === 12)?.coordinate.y).toBe(1);
    expect(lower.find((mutation) => mutation.coordinate.x === 13 && mutation.coordinate.z === 12)?.coordinate.y).toBe(2);
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
