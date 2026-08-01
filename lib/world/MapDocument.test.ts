import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "./block-registry";
import {
  createMapStateFromDocument,
  parseMapDocument,
  serializeMapDocument,
  type MapDocument,
} from "./map-document";
import { createFlatVoxelWorld } from "./voxel-world";

describe("map document format", () => {
  it("exports and imports deterministic world differences, zones and entities", () => {
    const world = createFlatVoxelWorld();
    world.setBlock(8, 0, 9, BLOCK_IDS.Path);
    world.setBlock(8, 1, 9, BLOCK_IDS.Special);
    world.setZone(8, 0, 9, 3);

    const document = serializeMapDocument(world, [{
      id: "marker-a",
      type: "marker",
      gridPosition: { x: 8, y: 1, z: 9 },
      rotationY: 0,
    }]);
    const imported = createMapStateFromDocument(document);

    expect(document.edits).toEqual([
      { x: 8, y: 0, z: 9, blockId: BLOCK_IDS.Path },
      { x: 8, y: 1, z: 9, blockId: BLOCK_IDS.Special },
    ]);
    expect(document.zones).toEqual([{ x: 8, y: 0, z: 9, zoneId: 3 }]);
    expect(imported.world.getBlock(8, 1, 9)).toBe(BLOCK_IDS.Special);
    expect(imported.world.getZone(8, 0, 9)).toBe(3);
    expect(imported.entities).toHaveLength(1);
    expect(serializeMapDocument(imported.world, imported.entities)).toEqual(document);
  });

  it("orders exported edits deterministically", () => {
    const world = createFlatVoxelWorld();
    world.setBlock(9, 2, 9, BLOCK_IDS.Special);
    world.setBlock(1, 0, 3, BLOCK_IDS.Path);
    world.setBlock(2, 0, 1, BLOCK_IDS.Boundary);

    expect(serializeMapDocument(world, []).edits).toEqual([
      { x: 2, y: 0, z: 1, blockId: BLOCK_IDS.Boundary },
      { x: 1, y: 0, z: 3, blockId: BLOCK_IDS.Path },
      { x: 9, y: 2, z: 9, blockId: BLOCK_IDS.Special },
    ]);
  });

  it("rejects invalid document versions and coordinates without mutating current worlds", () => {
    const currentWorld = createFlatVoxelWorld();
    const beforeBlock = currentWorld.getBlock(0, 0, 0);

    expect(parseMapDocument({ version: 99 })).toEqual({
      ok: false,
      error: "Unsupported map document version: 99.",
    });

    const invalidCoordinateDocument: MapDocument = {
      version: 1,
      world: {
        width: 64,
        depth: 64,
        height: 12,
        blockSize: 1,
        chunkSize: 16,
        generator: "flat-v1",
      },
      edits: [{ x: 64, y: 0, z: 0, blockId: BLOCK_IDS.Path }],
      zones: [],
      entities: [],
    };

    expect(parseMapDocument(invalidCoordinateDocument).ok).toBe(false);
    expect(currentWorld.getBlock(0, 0, 0)).toBe(beforeBlock);
  });

  it("rejects invalid entity coordinates and unknown block IDs", () => {
    const invalidEntity = {
      version: 1,
      world: {
        width: 64,
        depth: 64,
        height: 12,
        blockSize: 1,
        chunkSize: 16,
        generator: "flat-v1",
      },
      edits: [{ x: 0, y: 0, z: 0, blockId: 99 }],
      zones: [],
      entities: [{ id: "bad", type: "marker", gridPosition: { x: 0, y: 99, z: 0 }, rotationY: 0 }],
    };

    expect(parseMapDocument(invalidEntity).ok).toBe(false);
  });
});
