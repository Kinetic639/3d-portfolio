import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import type { RenderChunk } from "@/lib/world/voxel-world";
import { cloneMapDefinition, createBlankMapDefinition } from "@/lib/maps/map-definition";
import { loadMapDraft, loadMapStateSync, resolveMapDefinition, saveMapDraft } from "@/lib/maps/map-registry";
import {
  createDefaultCenterOnlyWorldLayout,
  createCompleteWorldLayout,
  createNorthPrototypeWorldLayout,
  loadWorldLayoutStateSync,
  NORTH_SCENERY_MAP_ID,
} from "./world-layout-loader";
import { WORLD_REGION_IDS } from "./world-layout-types";
import { loadWorldLayoutDraft, saveWorldLayoutDraft } from "./world-layout-document";

describe("world layout loading and persistence", () => {
  it("hydrates all nine independently authored regions", () => {
    const layout = createCompleteWorldLayout();
    const loaded = loadWorldLayoutStateSync(
      layout,
      (mapId) => loadMapStateSync(mapId, { includeDevelopment: true }).definition,
      WORLD_REGION_IDS,
    );

    expect(layout.regions).toHaveLength(9);
    for (const regionId of WORLD_REGION_IDS) {
      expect(loaded.regions[regionId]?.status).toBe("ready");
    }
  });

  it("wraps the existing authored map as an unchanged center region", () => {
    const existing = loadMapStateSync("portfolio-primary-flat", { includeDevelopment: true });
    const layout = createDefaultCenterOnlyWorldLayout();
    const loaded = loadWorldLayoutStateSync(layout, (mapId) => loadMapStateSync(mapId, { includeDevelopment: true }).definition);
    const center = loaded.regions.center;

    expect(center?.status).toBe("ready");
    if (center?.status === "ready") {
      expect(center.region.definition).toEqual(existing.definition);
      expect(center.region.world.blocks).toEqual(existing.world.blocks);
      expect(center.region.world.blocks).not.toBe(existing.world.blocks);
      expect(center.region.world.gridToWorld(0, 0, 0)).toEqual({ x: -31.5, y: 0.5, z: -31.5 });
      expect(center.region.world.createRenderChunks().map(revealSignature)).toEqual(
        existing.world.createRenderChunks().map(revealSignature),
      );
    }
  });

  it("loads Center and North independently and leaves unrequested North unloaded", async () => {
    const layout = createNorthPrototypeWorldLayout();
    const definitions = new Map([
      ["portfolio-primary-flat", await resolveMapDefinition("portfolio-primary-flat", { includeDevelopment: true })],
      [NORTH_SCENERY_MAP_ID, await resolveMapDefinition(NORTH_SCENERY_MAP_ID, { includeDevelopment: true })],
    ]);
    const resolve = (mapId: string) => cloneMapDefinition(definitions.get(mapId)!);

    const centerOnly = loadWorldLayoutStateSync(layout, resolve);
    expect(centerOnly.regions.center?.status).toBe("ready");
    expect(centerOnly.regions.north).toEqual({ status: "unloaded" });

    const complete = loadWorldLayoutStateSync(layout, resolve, ["center", "north"]);
    expect(complete.regions.north?.status).toBe("ready");
    if (complete.regions.center?.status === "ready" && complete.regions.north?.status === "ready") {
      complete.regions.north.region.world.setBlock(4, 1, 4, BLOCK_IDS.Stone);
      expect(complete.regions.center.region.world.getBlock(4, 1, 4)).not.toBe(BLOCK_IDS.Stone);
    }
  });

  it("provides two complete North foundation levels for river carving", async () => {
    const north = await resolveMapDefinition(NORTH_SCENERY_MAP_ID, { includeDevelopment: true });
    const loaded = loadWorldLayoutStateSync(
      createNorthPrototypeWorldLayout(),
      (mapId) => mapId === NORTH_SCENERY_MAP_ID ? north : createBlankMapDefinition({ id: mapId, name: mapId }),
      ["north"],
    );
    const state = loaded.regions.north;

    expect(state?.status).toBe("ready");
    if (state?.status === "ready") {
      for (let z = 0; z < 64; z += 1) {
        for (let x = 0; x < 64; x += 1) {
          expect(state.region.world.getBlock(x, 0, z)).toBe(BLOCK_IDS.Riverbed);
          expect(state.region.world.getBlock(x, 1, z)).toBe(BLOCK_IDS.Ground);
          expect(state.region.world.getBlock(x, 2, z)).toBe(BLOCK_IDS.Air);
        }
      }
    }
  });

  it("round-trips the layout and a North map draft without modifying Center", () => {
    const storage = createMemoryStorage();
    const layout = createNorthPrototypeWorldLayout();
    const center = createBlankMapDefinition({ id: "portfolio-primary-flat", name: "Center", flatBaseLayer: true });
    const north = createBlankMapDefinition({ id: NORTH_SCENERY_MAP_ID, name: "North", flatBaseLayer: true });
    north.blocks.edits.push({ x: 4, y: 1, z: 4, blockId: BLOCK_IDS.Stone });

    saveWorldLayoutDraft(storage, layout);
    saveMapDraft(storage, north);

    expect(loadWorldLayoutDraft(storage, layout.id)).toEqual(layout);
    expect(loadMapDraft(storage, NORTH_SCENERY_MAP_ID)?.blocks.edits).toContainEqual({ x: 4, y: 1, z: 4, blockId: BLOCK_IDS.Stone });
    expect(center.blocks.edits).not.toContainEqual({ x: 4, y: 1, z: 4, blockId: BLOCK_IDS.Stone });
  });

  it("reports region-specific resolver failures", () => {
    const loaded = loadWorldLayoutStateSync(createNorthPrototypeWorldLayout(), (mapId) => {
      if (mapId === NORTH_SCENERY_MAP_ID) throw new Error("missing source");
      return createBlankMapDefinition({ id: mapId, name: mapId });
    }, ["north"]);

    expect(loaded.regions.north).toEqual({
      status: "error",
      error: `Failed to load portfolio-world/north (${NORTH_SCENERY_MAP_ID}): missing source`,
    });
  });
});

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } as Storage;
}

function revealSignature(chunk: RenderChunk) {
  return chunk.renderableCells.map((cell) => [cell.cellIndex, cell.expansionDelay, cell.isCenterLoaderBlock]);
}
