import { describe, expect, it } from "vitest";
import { createTerrainMutations } from "@/lib/editor/terrain-brushes";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { MapEditorSession } from "@/lib/editor/map-editor";
import { buildZoneOverlayChunkMeshes, buildZoneOverlayMeshes, getDirtyZoneChunkIdsForColumns } from "./zone-overlay";
import { createFlatVoxelWorld } from "@/lib/world/voxel-world";
import { ROTATIONS, SHAPE_IDS } from "@/lib/voxel-shapes/shape-ids";

describe("terrain-conforming zone overlays", () => {
  it("builds one zone over columns with several independent terrain elevations", () => {
    const world = createFlatVoxelWorld();
    world.setBlock(2, 1, 2, BLOCK_IDS.Ground);
    world.setBlock(3, 1, 2, BLOCK_IDS.Ground);
    world.setBlock(3, 2, 2, BLOCK_IDS.Ground);
    world.setColumnZone(2, 2, 1);
    world.setColumnZone(3, 2, 1);

    const overlay = buildZoneOverlayMeshes(world);
    const yValues = uniqueRoundedY(overlay.chunks.flatMap((chunk) => [...chunk.positions]));

    expect(overlay.totalCells).toBe(2);
    expect(Math.min(...yValues)).toBeCloseTo(2.027, 3);
    expect(Math.max(...yValues)).toBeCloseTo(3.027, 3);
  });

  it("conforms to full blocks, slabs, stairs and slopes without one flat max-height rectangle", () => {
    const world = createFlatVoxelWorld();
    world.setCell({ x: 4, y: 1, z: 4, blockId: BLOCK_IDS.Special, shapeId: SHAPE_IDS.CUBE, rotation: ROTATIONS.NORTH, state: 0, zoneId: 1 });
    world.setCell({ x: 5, y: 1, z: 4, blockId: BLOCK_IDS.Special, shapeId: SHAPE_IDS.SLAB, rotation: ROTATIONS.NORTH, state: 0, zoneId: 1 });
    world.setCell({ x: 6, y: 1, z: 4, blockId: BLOCK_IDS.Special, shapeId: SHAPE_IDS.STAIR, rotation: ROTATIONS.NORTH, state: 0, zoneId: 1 });
    world.setCell({ x: 7, y: 1, z: 4, blockId: BLOCK_IDS.Special, shapeId: SHAPE_IDS.SLOPE_STEEP, rotation: ROTATIONS.NORTH, state: 0, zoneId: 1 });

    const overlay = buildZoneOverlayMeshes(world);
    const yValues = uniqueRoundedY(overlay.chunks.flatMap((chunk) => [...chunk.positions]));

    expect(overlay.totalCells).toBe(4);
    expect(yValues.length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...yValues)).toBeLessThan(2.1);
    expect(Math.max(...yValues)).toBeGreaterThan(2);
  });

  it("keeps a zone footprint when terrain is raised and lowered", () => {
    const session = new MapEditorSession();
    session.world.setColumnZone(8, 8, 2);
    session.world.clearDirtyZoneChunks();

    session.applyTerrainMutations("raise", createTerrainMutations({
      world: session.world,
      operation: "raise",
      center: { x: 8, y: 0, z: 8 },
      blockId: BLOCK_IDS.Ground,
      zoneId: 2,
    }));
    expect(session.world.getColumnZone(8, 8)).toBe(2);

    session.applyTerrainMutations("lower", createTerrainMutations({
      world: session.world,
      operation: "lower",
      center: { x: 8, y: 1, z: 8 },
      blockId: BLOCK_IDS.Ground,
      zoneId: 2,
    }));
    expect(session.world.getColumnZone(8, 8)).toBe(2);
  });

  it("erases part of a zone on uneven terrain without changing adjacent columns", () => {
    const session = new MapEditorSession();
    session.world.setBlock(9, 1, 9, BLOCK_IDS.Ground);
    session.applyTool("zone", { x: 9, y: 1, z: 9 }, BLOCK_IDS.Ground, 1);
    session.applyTool("zone", { x: 10, y: 0, z: 9 }, BLOCK_IDS.Ground, 1);

    session.applyTool("removeZone", { x: 9, y: 1, z: 9 }, BLOCK_IDS.Ground, 0);

    expect(session.world.getColumnZone(9, 9)).toBe(0);
    expect(session.world.getColumnZone(10, 9)).toBe(1);
  });

  it("generates boundaries between neighboring zones", () => {
    const world = createFlatVoxelWorld();
    world.setColumnZone(12, 12, 1);
    world.setColumnZone(13, 12, 2);

    const chunks = buildZoneOverlayChunkMeshes(world, 0, 0);
    const first = chunks.find((chunk) => chunk.zoneId === 1);
    const second = chunks.find((chunk) => chunk.zoneId === 2);

    expect(first?.boundaryPositions.length).toBeGreaterThan(0);
    expect(second?.boundaryPositions.length).toBeGreaterThan(0);
  });

  it("does not render a highlight over an empty column", () => {
    const world = createFlatVoxelWorld();
    world.setBlock(14, 0, 14, BLOCK_IDS.Air);
    world.setColumnZone(14, 14, 1);

    const overlay = buildZoneOverlayMeshes(world);

    expect(world.getColumnZone(14, 14)).toBe(1);
    expect(overlay.totalCells).toBe(0);
  });

  it("supports undo and redo of zone column changes", () => {
    const session = new MapEditorSession();

    session.applyTool("zone", { x: 15, y: 0, z: 15 }, BLOCK_IDS.Ground, 4);
    expect(session.world.getColumnZone(15, 15)).toBe(4);

    session.undo();
    expect(session.world.getColumnZone(15, 15)).toBe(0);

    session.redo();
    expect(session.world.getColumnZone(15, 15)).toBe(4);
  });

  it("marks only affected zone chunks dirty for zone painting", () => {
    const world = createFlatVoxelWorld();
    world.clearDirtyZoneChunks();

    world.setColumnZone(15, 15, 1);

    expect([...world.dirtyZoneChunks]).toEqual(["chunk-0-0"]);
    expect(getDirtyZoneChunkIdsForColumns(world, [{ x: 15, z: 15 }, { x: 16, z: 15 }])).toEqual(["chunk-0-0", "chunk-1-0"]);
  });
});

function uniqueRoundedY(values: number[]) {
  const ys: number[] = [];
  for (let index = 1; index < values.length; index += 3) {
    ys.push(Number(values[index].toFixed(3)));
  }
  return [...new Set(ys)].sort((a, b) => a - b);
}
