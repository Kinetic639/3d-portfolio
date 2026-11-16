import { describe, expect, it } from "vitest";
import { MAP_PRESETS, createMapPresetWorld } from "./map-presets";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { WORLD_CONFIG, WORLD_SURFACE_CELL_COUNT } from "@/lib/world/world-config";

describe("map presets", () => {
  it("create valid worlds and varied stress-test block counts", () => {
    const counts = MAP_PRESETS.map((preset) => {
      const world = createMapPresetWorld(preset.id);
      const stats = world.getStats();

      expect(stats.renderedInstances).toBeGreaterThan(0);
      expect(stats.renderedInstances).toBeLessThanOrEqual(WORLD_CONFIG.width * WORLD_CONFIG.depth * WORLD_CONFIG.height);
      expect(world.createRenderChunks()).toHaveLength(16);

      return stats.renderedInstances;
    });
    const stressCounts = ["flat", "portfolioCampus", "terracedIslands", "denseCity", "maxStress"].map((presetId) => {
      const world = createMapPresetWorld(presetId as (typeof MAP_PRESETS)[number]["id"]);
      return world.getStats().renderedInstances;
    });

    expect(new Set(stressCounts).size).toBe(stressCounts.length);
    expect(counts[0]).toBe(WORLD_SURFACE_CELL_COUNT);
    expect(Math.max(...counts)).toBeGreaterThan(WORLD_SURFACE_CELL_COUNT * 6);
  });

  it("preserves the original four center ground blocks in every preset", () => {
    for (const preset of MAP_PRESETS) {
      const world = createMapPresetWorld(preset.id);

      expect(world.getBlock(31, 0, 31)).toBe(BLOCK_IDS.Ground);
      expect(world.getBlock(32, 0, 31)).toBe(BLOCK_IDS.Ground);
      expect(world.getBlock(31, 0, 32)).toBe(BLOCK_IDS.Ground);
      expect(world.getBlock(32, 0, 32)).toBe(BLOCK_IDS.Ground);
    }
  });
});
