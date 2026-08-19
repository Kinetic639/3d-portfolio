import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { VoxelWorld } from "@/lib/world/voxel-world";
import { MapEditorSession } from "./map-editor";
import { DEFAULT_TERRAIN_BRUSH } from "./terrain-brushes";
import { WorldLayoutEditorSession, createLayoutTerrainMutations } from "./world-layout-editor";
import { WORLD_REGION_IDS, type WorldRegionId } from "@/lib/world-layout/world-layout-types";

function createAllRegionSessions() {
  return Object.fromEntries(WORLD_REGION_IDS.map((id) => [id, new MapEditorSession(new VoxelWorld())])) as Record<WorldRegionId, MapEditorSession>;
}

describe("world layout editor", () => {
  it("applies and atomically undoes a brush crossing Center and North", () => {
    const center = new MapEditorSession(new VoxelWorld());
    const north = new MapEditorSession(new VoxelWorld());
    const sessions = { center, north };
    const editor = new WorldLayoutEditorSession(sessions);
    const mutations = createLayoutTerrainMutations({
      sessions,
      operation: "fill",
      centers: [{ x: 10, y: 2, z: 0 }],
      settings: { ...DEFAULT_TERRAIN_BRUSH, shape: "square", size: 3 },
      blockId: BLOCK_IDS.Stone,
      zoneId: 0,
    });

    const applied = editor.applyTerrainMutations("fill", mutations);
    expect(applied.changed).toBe(true);
    expect(center.world.getBlock(10, 2, 0)).toBe(BLOCK_IDS.Stone);
    expect(north.world.getBlock(10, 2, 63)).toBe(BLOCK_IDS.Stone);

    editor.undo();
    expect(center.world.getBlock(10, 2, 0)).toBe(BLOCK_IDS.Air);
    expect(north.world.getBlock(10, 2, 63)).toBe(BLOCK_IDS.Air);

    editor.redo();
    expect(center.world.getBlock(10, 2, 0)).toBe(BLOCK_IDS.Stone);
    expect(north.world.getBlock(10, 2, 63)).toBe(BLOCK_IDS.Stone);
  });

  it.each([
    ["north", { x: 20, y: 2, z: 0 }],
    ["south", { x: 20, y: 2, z: 63 }],
    ["west", { x: 0, y: 2, z: 20 }],
    ["east", { x: 63, y: 2, z: 20 }],
  ] as const)("partitions a brush across the %s seam", (neighbor, center) => {
    const sessions = createAllRegionSessions();
    const mutations = createLayoutTerrainMutations({
      sessions,
      operation: "fill",
      centers: [center],
      settings: { ...DEFAULT_TERRAIN_BRUSH, shape: "square", size: 3 },
      blockId: BLOCK_IDS.Stone,
      zoneId: 0,
    });

    expect(mutations.center?.length).toBeGreaterThan(0);
    expect(mutations[neighbor]?.length).toBeGreaterThan(0);
  });

  it("partitions one brush across a four-region intersection", () => {
    const sessions = createAllRegionSessions();
    const mutations = createLayoutTerrainMutations({
      sessions,
      operation: "fill",
      centers: [{ x: 0, y: 2, z: 0 }],
      settings: { ...DEFAULT_TERRAIN_BRUSH, shape: "square", size: 3 },
      blockId: BLOCK_IDS.Stone,
      zoneId: 0,
    });

    expect(Object.keys(mutations).sort()).toEqual(["center", "north", "north-west", "west"]);
  });

  it.each(["paint", "raise", "lower", "flatten", "erase"] as const)("supports %s across a region seam", (operation) => {
    const sessions = createAllRegionSessions();
    for (const session of Object.values(sessions)) {
      for (let x = 9; x <= 11; x += 1) {
        for (const z of [0, 1, 62, 63]) {
          session.world.setBlock(x, 0, z, BLOCK_IDS.Ground);
          if (operation === "lower") session.world.setBlock(x, 1, z, BLOCK_IDS.Ground);
        }
      }
    }
    const mutations = createLayoutTerrainMutations({
      sessions,
      operation,
      centers: [{ x: 10, y: operation === "flatten" || operation === "lower" ? 1 : 0, z: 0 }],
      settings: { ...DEFAULT_TERRAIN_BRUSH, shape: "square", size: 3 },
      blockId: BLOCK_IDS.Stone,
      zoneId: 0,
    });

    expect(mutations.center?.length).toBeGreaterThan(0);
    expect(mutations.north?.length).toBeGreaterThan(0);
  });
});
