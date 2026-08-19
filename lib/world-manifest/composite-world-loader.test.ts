import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { MapEditorSession } from "@/lib/editor/map-editor";
import { createTerrainMutations } from "@/lib/editor/terrain-brushes";
import { createZoneColumnChanges } from "@/lib/editor/zone-tools";
import { buildSurfaceChunkMesh } from "@/lib/terrain/surface-mesher";
import { SHAPE_IDS } from "@/lib/voxel-shapes/shape-ids";
import { computeExpansionDelay, getExpansionRevealEnd, TERRAIN_REVEAL_WINDOW } from "@/lib/world/reveal";
import { loadCompositeWorldStateSync, translateSceneryWorldPosition } from "./composite-world-loader";
import { globalToRegionLocal, regionLocalToGlobal } from "./world-region-coordinates";

describe("composite world loader", () => {
  it("assembles all nine regions into one 192 by 192 world", () => {
    const state = loadCompositeWorldStateSync();

    expect(state.world.config).toMatchObject({ width: 192, depth: 192, minY: -12, height: 32 });
    expect(state.world.getStats().chunks).toBe(144);
    expect([...state.sourceRegions.keys()]).toEqual([
      "north-west", "north", "north-east", "west", "center", "east", "south-west", "south", "south-east",
    ]);
    expect(state.world.getBlock(64, 0, 0)).toBe(BLOCK_IDS.Ground);
    expect(state.world.getBlock(64, -1, 0)).toBe(BLOCK_IDS.Stone);
    expect(state.world.getBlock(127, 0, 63)).toBe(BLOCK_IDS.Ground);
  });

  it("fills the complete North source with stone depth and one grass surface", () => {
    const north = loadCompositeWorldStateSync().sourceRegions.get("north")!;
    for (let z = 0; z < 64; z += 1) {
      for (let x = 0; x < 64; x += 1) {
        expect(north.world.getBlock(x, 0, z)).toBe(BLOCK_IDS.Ground);
        expect(north.world.getBlock(x, 1, z)).toBe(BLOCK_IDS.Air);
        for (let y = -12; y < 0; y += 1) {
          expect(north.world.getBlock(x, y, z)).toBe(BLOCK_IDS.Stone);
        }
      }
    }
  }, 30_000);

  it("preserves every center cell and its existing world position", () => {
    const state = loadCompositeWorldStateSync();
    const center = state.sourceRegions.get("center");
    expect(center).toBeDefined();
    if (!center) return;

    for (let index = 0; index < center.world.blocks.length; index += 1) {
      const local = center.world.getCoordinates(index);
      expect(local).not.toBeNull();
      if (!local) continue;
      const global = regionLocalToGlobal("center", local);
      expect(state.world.getCell(global.x, global.y, global.z)).toMatchObject({
        blockId: center.world.getBlock(local.x, local.y, local.z),
        shapeId: center.world.getShape(local.x, local.y, local.z),
        rotation: center.world.getRotation(local.x, local.y, local.z),
        state: center.world.getState(local.x, local.y, local.z),
      });
      expect(state.world.gridToWorld(global.x, global.y, global.z)).toEqual(center.world.gridToWorld(local.x, local.y, local.z));
    }
  }, 30_000);

  it("preserves center reveal timing while extending the wave north", () => {
    const state = loadCompositeWorldStateSync();
    const center = state.sourceRegions.get("center")!;
    expect(computeExpansionDelay(state.world, 64, 0, 64)).toBeCloseTo(computeExpansionDelay(center.world, 0, 0, 0));
    expect(computeExpansionDelay(state.world, 95, 0, 95)).toBe(0);
    expect(computeExpansionDelay(state.world, 95, 0, 0)).toBeGreaterThan(computeExpansionDelay(state.world, 95, 0, 64));
    expect(getExpansionRevealEnd(state.world)).toBeGreaterThan(1);
    expect(getExpansionRevealEnd(state.world)).toBeGreaterThanOrEqual(
      computeExpansionDelay(state.world, 95, 0, 0) + TERRAIN_REVEAL_WINDOW,
    );
  });

  it("translates center grid metadata but preserves world-space metadata", () => {
    const state = loadCompositeWorldStateSync();
    const center = state.sourceRegions.get("center")!;
    expect(state.definition.spawnPoints[0].position).toEqual({ x: 95, y: 1, z: 95 });
    expect(state.definition.zoneAssignments[0]).toMatchObject({
      x: center.definition.zoneAssignments[0].x + 64,
      z: center.definition.zoneAssignments[0].z + 64,
    });
    expect(state.definition.fluids.sources).toEqual(center.definition.fluids.sources.map((source) => ({
      ...source,
      x: source.x + 64,
      z: source.z + 64,
    })));
    expect(state.definition.fluids.settledCache).toBeUndefined();
    expect(state.definition.cameraPresets).toEqual(center.definition.cameraPresets);
    expect(state.definition.entities).toEqual(center.definition.entities);
    expect(state.definition.navigation).toEqual(center.definition.navigation);
  });

  it("keeps North and center adjacent across global Z 63 and 64", () => {
    expect(regionLocalToGlobal("north", { x: 12, y: 0, z: 63 })).toEqual({ x: 76, y: 0, z: 63 });
    expect(regionLocalToGlobal("center", { x: 12, y: 0, z: 0 })).toEqual({ x: 76, y: 0, z: 64 });
    expect(globalToRegionLocal({ x: 76, y: 0, z: 63 })).toEqual({ regionId: "north", x: 12, y: 0, z: 63 });
    expect(globalToRegionLocal({ x: 76, y: 0, z: 64 })).toEqual({ regionId: "center", x: 12, y: 0, z: 0 });
  });

  it("occludes seam faces and dirties render chunks on both sides", () => {
    const state = loadCompositeWorldStateSync();
    const northCellIndex = state.world.getIndex(80, 0, 63)!;
    const northChunk = buildSurfaceChunkMesh(state.world, 5, 3);
    expect(northChunk.faceMappings.some((face) => face.cellIndex === northCellIndex && face.direction === "pz")).toBe(false);

    state.world.clearDirtyChunks();
    state.world.setBlock(80, 0, 64, BLOCK_IDS.Path);
    expect([...state.world.dirtyChunks]).toEqual(expect.arrayContaining(["chunk-5-3", "chunk-5-4"]));
  });

  it("uses the same VoxelWorld and editor session on both sides of the seam", () => {
    const state = loadCompositeWorldStateSync();
    const session = new MapEditorSession(state.world, state.entities, state.definition.fluids.settings);
    session.paint({ x: 76, y: 0, z: 63 }, BLOCK_IDS.Path);
    session.paint({ x: 76, y: 0, z: 64 }, BLOCK_IDS.Path);
    expect(session.world.getBlock(76, 0, 63)).toBe(BLOCK_IDS.Path);
    expect(session.world.getBlock(76, 0, 64)).toBe(BLOCK_IDS.Path);
    expect(session.getSnapshot().undoDepth).toBe(2);
  });

  it("runs terrain, shape, zone, and liquid tools throughout the composite bounds", () => {
    const state = loadCompositeWorldStateSync();
    const session = new MapEditorSession(state.world, state.entities, state.definition.fluids.settings);
    const apply = (operation: Parameters<typeof createTerrainMutations>[0]["operation"], center: { x: number; y: number; z: number }) => (
      session.applyTerrainMutations(operation, createTerrainMutations({
        world: session.world,
        operation,
        center,
        blockId: BLOCK_IDS.Path,
        zoneId: 0,
      }))
    );
    expect(apply("paint", { x: 10, y: 0, z: 10 }).changed).toBe(true);
    expect(apply("raise", { x: 180, y: 0, z: 10 }).changed).toBe(true);
    expect(apply("lower", { x: 180, y: 0, z: 10 }).changed).toBe(true);
    expect(apply("fill", { x: 10, y: 1, z: 180 }).changed).toBe(true);
    const shaped = createTerrainMutations({ world: session.world, operation: "fill", center: { x: 181, y: 1, z: 181 }, blockId: BLOCK_IDS.Stone, shapeId: SHAPE_IDS.SLAB, zoneId: 0 });
    expect(session.applyTerrainMutations("fill", shaped).changed).toBe(true);
    expect(session.world.getShape(181, 1, 181)).toBe(SHAPE_IDS.SLAB);
    expect(apply("clear", { x: 10, y: 1, z: 180 }).changed).toBe(true);
    expect(apply("paint-path", { x: 180, y: 0, z: 180 }).changed).toBe(true);
    expect(apply("flatten", { x: 96, y: 1, z: 96 }).changed).toBe(true);
    const zones = createZoneColumnChanges({ world: session.world, columns: [{ x: 5, y: 0, z: 100 }], mode: "paint", zoneId: 2 });
    session.applyZoneColumnChanges("zone", zones);
    expect(session.world.getColumnZone(5, 100)).toBe(2);
    expect(session.applyWaterSources([{ x: 150, y: 1, z: 100 }], { settle: false }).changed).toBe(true);
  }, 30_000);

  it("offsets scenery world-space entities while leaving center positions unchanged", () => {
    expect(translateSceneryWorldPosition("north", { x: 2, y: 3, z: 4 })).toEqual({ x: 2, y: 3, z: -60 });
    expect(translateSceneryWorldPosition("center", { x: 2, y: 3, z: 4 })).toEqual({ x: 2, y: 3, z: 4 });
  });
});
