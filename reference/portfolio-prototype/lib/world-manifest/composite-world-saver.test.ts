import { describe, expect, it } from "vitest";
import { createLoadedMapState } from "@/lib/maps/map-definition";
import { MapEditorSession } from "@/lib/editor/map-editor";
import { createTerrainMutations } from "@/lib/editor/terrain-brushes";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { loadCompositeWorldStateSync } from "./composite-world-loader";
import { partitionCompositeWorld } from "./composite-world-saver";

describe("composite world saver", () => {
  it("partitions and reloads one atomic brush stroke across the North/center seam", () => {
    const loaded = loadCompositeWorldStateSync();
    const session = new MapEditorSession(loaded.world, loaded.entities, loaded.definition.fluids.settings);
    const mutations = createTerrainMutations({
      world: session.world,
      operation: "paint",
      center: { x: 96, y: 0, z: 64 },
      settings: { shape: "square", size: 3, pathWidth: 1, pathEnds: "square", flattenHeight: 0 },
      blockId: BLOCK_IDS.Path,
      zoneId: 0,
    });
    session.applyTerrainMutations("paint", mutations);
    expect(session.getSnapshot().undoDepth).toBe(1);
    expect(session.world.getBlock(96, 0, 63)).toBe(BLOCK_IDS.Path);
    expect(session.world.getBlock(96, 0, 64)).toBe(BLOCK_IDS.Path);

    const partitions = partitionCompositeWorld({
      manifest: loaded.manifest,
      sourceRegions: loaded.sourceRegions,
      world: session.world,
      definition: loaded.definition,
      markerAnchors: session.entities,
    });
    expect(partitions.size).toBe(9);
    const byMapId = new Map([...partitions.values()].map((definition) => [definition.id, definition]));
    const reloaded = loadCompositeWorldStateSync(undefined, {
      loadRegion: (mapId) => createLoadedMapState(byMapId.get(mapId)!),
    });
    expect(Buffer.from(reloaded.world.blocks).equals(Buffer.from(session.world.blocks))).toBe(true);
    expect(Buffer.from(reloaded.world.shapes).equals(Buffer.from(session.world.shapes))).toBe(true);
    expect(Buffer.from(reloaded.world.rotations).equals(Buffer.from(session.world.rotations))).toBe(true);
    expect(Buffer.from(reloaded.world.states).equals(Buffer.from(session.world.states))).toBe(true);
    expect(Buffer.from(reloaded.world.zones).equals(Buffer.from(session.world.zones))).toBe(true);
    expect(Buffer.from(reloaded.world.fluidTypes).equals(Buffer.from(session.world.fluidTypes))).toBe(true);
    expect(reloaded.definition.entities).toEqual(loaded.definition.entities);
    expect(reloaded.definition.navigation).toEqual(loaded.definition.navigation);
  }, 60_000);
});
