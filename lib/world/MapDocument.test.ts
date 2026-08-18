import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "./block-registry";
import {
  createMapStateFromDocument,
  parseMapDocument,
  serializeMapDocument,
  type MapDocument,
} from "./map-document";
import { createFlatVoxelWorld } from "./voxel-world";
import { ROTATIONS, SHAPE_IDS } from "@/lib/voxel-shapes/shape-ids";
import { WaterSimulator } from "@/lib/fluids/water-simulator";

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
    expect(document.zones).toEqual([{ x: 8, z: 9, zoneId: 3 }]);
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

  it("migrates v1 flat edits to cube/default metadata", () => {
    const document: MapDocument = {
      version: 1,
      world: {
        width: 64,
        depth: 64,
        height: 12,
        blockSize: 1,
        chunkSize: 16,
        generator: "flat-v1",
      },
      edits: [{ x: 8, y: 1, z: 9, blockId: BLOCK_IDS.Special }],
      zones: [],
      entities: [],
    };

    const parsed = parseMapDocument(document);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const imported = createMapStateFromDocument(parsed.document);
    expect(imported.world.getCell(8, 1, 9)).toMatchObject({
      blockId: BLOCK_IDS.Special,
      shapeId: SHAPE_IDS.CUBE,
      rotation: ROTATIONS.NORTH,
      state: 0,
    });
  });

  it("round trips cell-edits-v2 shape metadata compactly", () => {
    const world = createFlatVoxelWorld();
    world.setCell({
      x: 10,
      y: 1,
      z: 11,
      blockId: BLOCK_IDS.Special,
      shapeId: SHAPE_IDS.SLAB,
      rotation: ROTATIONS.SOUTH,
      state: 1,
      zoneId: 0,
    });

    const document = serializeMapDocument(world, []);
    const imported = createMapStateFromDocument(document);

    expect(document.version).toBe(4);
    expect(document.cellEncoding).toBe("cell-edits-v2");
    expect(document.zoneEncoding).toBe("column-zones-v2");
    expect(document.edits).toContainEqual({
      x: 10,
      y: 1,
      z: 11,
      blockId: BLOCK_IDS.Special,
      shapeId: SHAPE_IDS.SLAB,
      rotation: ROTATIONS.SOUTH,
      state: 1,
    });
    expect(imported.world.getCell(10, 1, 11)).toMatchObject({
      blockId: BLOCK_IDS.Special,
      shapeId: SHAPE_IDS.SLAB,
      rotation: ROTATIONS.SOUTH,
      state: 1,
    });
    expect(serializeMapDocument(imported.world, imported.entities)).toEqual(document);
  });

  it("migrates legacy voxel zone assignments into one X/Z column assignment", () => {
    const document: MapDocument = {
      version: 2,
      cellEncoding: "cell-edits-v2",
      zoneEncoding: "voxel-zones-v1",
      world: {
        width: 64,
        depth: 64,
        height: 12,
        blockSize: 1,
        chunkSize: 16,
        generator: "flat-v1",
      },
      edits: [],
      zones: [
        { x: 12, y: 0, z: 14, zoneId: 2 },
        { x: 12, y: 3, z: 14, zoneId: 2 },
        { x: 13, y: 1, z: 14, zoneId: 3 },
      ],
      entities: [],
    };

    const parsed = parseMapDocument(document);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.document.zones).toEqual([
      { x: 12, y: 3, z: 14, zoneId: 2 },
      { x: 13, y: 1, z: 14, zoneId: 3 },
    ]);
    const imported = createMapStateFromDocument(parsed.document);
    expect(imported.world.getColumnZone(12, 14)).toBe(2);
    expect(imported.world.getColumnZone(13, 14)).toBe(3);
    expect(serializeMapDocument(imported.world, []).zones).toEqual([
      { x: 12, z: 14, zoneId: 2 },
      { x: 13, z: 14, zoneId: 3 },
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

  it("round trips authoritative water sources and uses a valid settled cache", () => {
    const world = createFlatVoxelWorld();
    for (const [x, z] of [[7, 8], [9, 8], [8, 7], [8, 9]]) world.setBlock(x, 1, z, BLOCK_IDS.Boundary);
    const simulator = new WaterSimulator(world);
    expect(simulator.setSource(8, 1, 8)).toBe(true);
    simulator.settle();

    const document = serializeMapDocument(world, []);
    expect(document.fluids?.sources).toEqual([{ x: 8, y: 1, z: 8, fluidId: 1 }]);
    const imported = createMapStateFromDocument(document);
    expect(imported.fluidLoad).toEqual({ cacheStatus: "hit", settled: true });
    expect(imported.world.getFluid(8, 1, 8)).toMatchObject({ type: 1, source: true });
    expect(serializeMapDocument(imported.world, []).fluids).toEqual(document.fluids);
  });

  it("rebuilds water from sources when a settled cache fingerprint is stale", () => {
    const world = createFlatVoxelWorld();
    const simulator = new WaterSimulator(world);
    simulator.setSource(8, 1, 8);
    simulator.settle();
    const document = serializeMapDocument(world, []);
    document.fluids!.settledCache!.terrainFingerprint = "stale";

    const imported = createMapStateFromDocument(document);
    expect(imported.fluidLoad).toEqual({ cacheStatus: "rebuilt", settled: true });
    expect(imported.world.getFluid(8, 1, 8).source).toBe(true);
  });

  it("rejects fluid sources in solid terrain and retired terrain ids", () => {
    const base = serializeMapDocument(createFlatVoxelWorld(), []);
    const solidSource = structuredClone(base);
    solidSource.fluids!.sources = [{ x: 0, y: 0, z: 0, fluidId: 1 }];
    solidSource.fluids!.settledCache = undefined;
    expect(parseMapDocument(solidSource)).toMatchObject({ ok: false, error: expect.stringContaining("solid terrain") });

    const retiredBlock = structuredClone(base) as unknown as Record<string, unknown>;
    retiredBlock.edits = [{ x: 1, y: 1, z: 1, blockId: 6 }];
    expect(parseMapDocument(retiredBlock)).toMatchObject({ ok: false, error: "Unknown block id: 6." });

    const retiredShape = structuredClone(base) as unknown as Record<string, unknown>;
    retiredShape.edits = [{ x: 1, y: 1, z: 1, blockId: BLOCK_IDS.Ground, shapeId: 22 }];
    expect(parseMapDocument(retiredShape)).toMatchObject({ ok: false, error: "Unknown shape id: 22." });
  });
});
