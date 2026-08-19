import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "./block-registry";
import { EXPECTED_WORLD_STATS, VoxelWorld, createFlatVoxelWorld } from "./voxel-world";
import { getWorldMaxY, WORLD_AIR_CELL_COUNT, WORLD_CELL_COUNT, WORLD_CONFIG, WORLD_FOUNDATION_CELL_COUNT, WORLD_SURFACE_CELL_COUNT } from "./world-config";
import { ROTATIONS, SHAPE_IDS } from "@/lib/voxel-shapes/shape-ids";
import { EMPTY_FLUID_CELL, FLUID_IDS } from "@/lib/fluids/fluid-types";

describe("voxel world foundation", () => {
  it("allocates the complete logical volume in a compact typed array", () => {
    const world = createFlatVoxelWorld();

    expect(world.blocks).toBeInstanceOf(Uint16Array);
    expect(world.shapes).toBeInstanceOf(Uint8Array);
    expect(world.rotations).toBeInstanceOf(Uint8Array);
    expect(world.states).toBeInstanceOf(Uint8Array);
    expect(world.fluidTypes).toBeInstanceOf(Uint8Array);
    expect(world.fluidLevels).toBeInstanceOf(Uint8Array);
    expect(world.fluidFlags).toBeInstanceOf(Uint8Array);
    expect(world.zones).toBeInstanceOf(Uint8Array);
    expect(world.blocks).toHaveLength(WORLD_CELL_COUNT);
    expect(world.shapes).toHaveLength(WORLD_CELL_COUNT);
    expect(world.rotations).toHaveLength(WORLD_CELL_COUNT);
    expect(world.states).toHaveLength(WORLD_CELL_COUNT);
    expect(world.fluidTypes).toHaveLength(WORLD_CELL_COUNT);
    expect(world.fluidLevels).toHaveLength(WORLD_CELL_COUNT);
    expect(world.fluidFlags).toHaveLength(WORLD_CELL_COUNT);
    expect(world.zones).toHaveLength(WORLD_SURFACE_CELL_COUNT);
    expect(world.getStats().logicalCells).toBe(131_072);
  });

  it("stores shape, rotation and state independently from block id", () => {
    const world = createFlatVoxelWorld();

    expect(world.setCell({
      x: 4,
      y: 0,
      z: 5,
      blockId: BLOCK_IDS.Path,
      shapeId: SHAPE_IDS.STAIR,
      rotation: ROTATIONS.EAST,
      state: 7,
      zoneId: 2,
    })).toBe(true);

    expect(world.getCell(4, 0, 5)).toMatchObject({
      blockId: BLOCK_IDS.Path,
      shapeId: SHAPE_IDS.STAIR,
      rotation: ROTATIONS.EAST,
      state: 7,
      zoneId: 2,
    });
    expect([...world.dirtyChunks]).toEqual(["chunk-0-0"]);
  });

  it("resets shape metadata when a cell is erased to Air", () => {
    const world = createFlatVoxelWorld();
    world.setCell({ x: 4, y: 0, z: 5, blockId: BLOCK_IDS.Special, shapeId: SHAPE_IDS.SLAB, rotation: ROTATIONS.WEST, state: 1, zoneId: 3 });

    world.setBlock(4, 0, 5, BLOCK_IDS.Air);

    expect(world.getCell(4, 0, 5)).toMatchObject({
      blockId: BLOCK_IDS.Air,
      shapeId: SHAPE_IDS.CUBE,
      rotation: ROTATIONS.NORTH,
      state: 0,
      zoneId: 3,
    });
  });

  it("stores outdoor zones by X/Z column independently from terrain elevation", () => {
    const world = createFlatVoxelWorld();

    expect(world.setZone(4, 0, 5, 3)).toBe(true);

    expect(world.getZone(4, 0, 5)).toBe(3);
    expect(world.getZone(4, 8, 5)).toBe(3);
    expect(world.getColumnZone(4, 5)).toBe(3);
    expect(world.getStats().zoneAssignments).toBe(1);
    expect([...world.dirtyZoneChunks]).toEqual(["chunk-0-0"]);

    world.setBlock(4, 0, 5, BLOCK_IDS.Air);

    expect(world.getColumnZone(4, 5)).toBe(3);
  });

  it("migrates legacy 3D zone arrays into compact column zones", () => {
    const legacyZones = new Uint8Array(WORLD_CELL_COUNT);
    const legacyWorld = new VoxelWorld();
    const low = legacyWorld.getIndex(6, 0, 7);
    const high = legacyWorld.getIndex(6, 4, 7);
    expect(low).not.toBeNull();
    expect(high).not.toBeNull();
    legacyZones[low as number] = 2;
    legacyZones[high as number] = 4;

    const world = new VoxelWorld(WORLD_CONFIG, undefined, legacyZones);

    expect(world.zones).toHaveLength(WORLD_SURFACE_CELL_COUNT);
    expect(world.getColumnZone(6, 7)).toBe(4);
    expect(world.getStats().zoneAssignments).toBe(1);
  });

  it("generates a deterministic underground foundation and leaves upper cells as air", () => {
    const world = createFlatVoxelWorld();
    const stats = world.getStats();

    expect(stats.nonAirBlocks).toBe(WORLD_FOUNDATION_CELL_COUNT);
    expect(stats.renderedInstances).toBe(WORLD_FOUNDATION_CELL_COUNT);
    expect(stats.airCells).toBe(WORLD_AIR_CELL_COUNT);
    expect(world.getBlock(0, 0, 0)).toBe(BLOCK_IDS.Ground);
    expect(world.getBlock(0, WORLD_CONFIG.minY, 0)).toBe(BLOCK_IDS.Stone);
    expect(world.getBlock(0, -1, 0)).toBe(BLOCK_IDS.Stone);
    expect(world.getBlock(0, 1, 0)).toBe(BLOCK_IDS.Air);
  });

  it("maps every logical coordinate to a unique valid flat-array index", () => {
    const world = createFlatVoxelWorld();
    const indexes = new Set<number>();
    let invalidIndexCount = 0;

    for (let y = WORLD_CONFIG.minY; y <= getWorldMaxY(); y += 1) {
      for (let z = 0; z < WORLD_CONFIG.depth; z += 1) {
        for (let x = 0; x < WORLD_CONFIG.width; x += 1) {
          const index = world.getIndex(x, y, z);
          if (index === null || index < 0 || index >= WORLD_CELL_COUNT) {
            invalidIndexCount += 1;
            continue;
          }
          indexes.add(index);
        }
      }
    }

    expect(invalidIndexCount).toBe(0);
    expect(indexes.size).toBe(WORLD_CELL_COUNT);
  });

  it("converts flat indexes back to logical coordinates", () => {
    const world = createFlatVoxelWorld();

    expect(world.getCoordinates(0)).toEqual({ x: 0, y: -12, z: 0 });
    expect(world.getCoordinates(63)).toEqual({ x: 63, y: -12, z: 0 });
    expect(world.getCoordinates(64)).toEqual({ x: 0, y: -12, z: 1 });
    expect(world.getCoordinates(4_096)).toEqual({ x: 0, y: -11, z: 0 });
    expect(world.getCoordinates(WORLD_CELL_COUNT - 1)).toEqual({ x: 63, y: 19, z: 63 });
  });

  it("rejects out-of-bounds coordinates safely", () => {
    const world = createFlatVoxelWorld();

    expect(world.isInsideWorld(-1, 0, 0)).toBe(false);
    expect(world.getIndex(64, 0, 0)).toBeNull();
    expect(world.getCoordinates(WORLD_CELL_COUNT)).toBeNull();
    expect(world.getBlock(0, 20, 0)).toBe(BLOCK_IDS.Air);
    expect(world.setBlock(0, 20, 0, BLOCK_IDS.Ground)).toBe(false);
    expect(world.setBlock(0, -13, 0, BLOCK_IDS.Ground)).toBe(false);
  });

  it("centres grid coordinates around the world origin", () => {
    const world = createFlatVoxelWorld();

    expect(world.gridToWorld(0, 0, 0)).toEqual({ x: -31.5, y: 0.5, z: -31.5 });
    expect(world.gridToWorld(63, 0, 63)).toEqual({ x: 31.5, y: 0.5, z: 31.5 });
  });

  it("round-trips grid coordinates through world positions", () => {
    const world = createFlatVoxelWorld();

    for (const coordinate of [
      { x: 0, y: 0, z: 0 },
      { x: 31, y: 0, z: 31 },
      { x: 32, y: 0, z: 32 },
      { x: 63, y: 11, z: 63 },
      { x: 0, y: -12, z: 0 },
      { x: 63, y: 19, z: 63 },
    ]) {
      expect(world.worldToGrid(world.gridToWorld(coordinate.x, coordinate.y, coordinate.z))).toEqual(coordinate);
    }
  });

  it("resolves the four central loader cells to expected world centres", () => {
    const world = createFlatVoxelWorld();

    expect(world.gridToWorld(31, 0, 31)).toEqual({ x: -0.5, y: 0.5, z: -0.5 });
    expect(world.gridToWorld(32, 0, 31)).toEqual({ x: 0.5, y: 0.5, z: -0.5 });
    expect(world.gridToWorld(31, 0, 32)).toEqual({ x: -0.5, y: 0.5, z: 0.5 });
    expect(world.gridToWorld(32, 0, 32)).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
  });

  it("creates sixteen render chunks with exact instance mappings", () => {
    const world = createFlatVoxelWorld();
    const chunks = world.createRenderChunks();

    expect(chunks).toHaveLength(16);
    expect(chunks.every((chunk) => chunk.renderableCells.length === EXPECTED_WORLD_STATS.instancesPerFlatChunk)).toBe(true);
    expect(chunks.every((chunk) => chunk.instanceToCell.length === chunk.renderableCells.length)).toBe(true);

    for (const chunk of chunks) {
      chunk.renderableCells.forEach((cell, instanceId) => {
        expect(chunk.instanceToCell[instanceId]).toBe(cell.cellIndex);
        expect(chunk.cellToInstance.get(cell.cellIndex)).toBe(instanceId);
        expect(world.getCoordinates(cell.cellIndex)).toEqual({ x: cell.x, y: cell.y, z: cell.z });
      });
    }
  });

  it("changes only the intended cell and marks affected chunks dirty", () => {
    const world = new VoxelWorld();
    const changed = world.setBlock(2, 0, 3, BLOCK_IDS.Ground);

    expect(changed).toBe(true);
    expect(world.getBlock(2, 0, 3)).toBe(BLOCK_IDS.Ground);
    expect(world.getBlock(3, 0, 3)).toBe(BLOCK_IDS.Air);
    expect([...world.dirtyChunks]).toEqual(["chunk-0-0"]);
  });

  it("marks neighbouring chunks dirty for boundary cell changes", () => {
    const world = new VoxelWorld();

    world.setBlock(15, 0, 16, BLOCK_IDS.Ground);

    expect(world.dirtyChunks.has("chunk-0-1")).toBe(true);
    expect(world.dirtyChunks.has("chunk-1-1")).toBe(true);
    expect(world.dirtyChunks.has("chunk-0-0")).toBe(true);
  });

  it("rebuilds only dirty chunks after a ground cell is changed to air and restored", () => {
    const world = createFlatVoxelWorld();
    const changedCellIndex = world.getIndex(2, 0, 3);

    expect(changedCellIndex).not.toBeNull();
    expect(world.getStats().renderedInstances).toBe(WORLD_FOUNDATION_CELL_COUNT);

    expect(world.setBlock(2, 0, 3, BLOCK_IDS.Air)).toBe(true);

    const airRebuild = world.rebuildDirtyChunks();
    const rebuiltAirChunk = airRebuild[0];

    expect(world.getStats().renderedInstances).toBe(WORLD_FOUNDATION_CELL_COUNT - 1);
    expect(airRebuild).toHaveLength(1);
    expect(rebuiltAirChunk.id).toBe("chunk-0-0");
    expect(rebuiltAirChunk.renderableCells).toHaveLength(EXPECTED_WORLD_STATS.instancesPerFlatChunk - 1);
    expect(rebuiltAirChunk.cellToInstance.has(changedCellIndex as number)).toBe(false);
    expect([...world.dirtyChunks]).toEqual([]);

    rebuiltAirChunk.renderableCells.forEach((cell, instanceId) => {
      expect(rebuiltAirChunk.instanceToCell[instanceId]).toBe(cell.cellIndex);
      expect(rebuiltAirChunk.cellToInstance.get(cell.cellIndex)).toBe(instanceId);
    });

    expect(world.setBlock(2, 0, 3, BLOCK_IDS.Ground)).toBe(true);

    const groundRebuild = world.rebuildDirtyChunks();
    const rebuiltGroundChunk = groundRebuild[0];

    expect(world.getStats().renderedInstances).toBe(WORLD_FOUNDATION_CELL_COUNT);
    expect(groundRebuild).toHaveLength(1);
    expect(rebuiltGroundChunk.id).toBe("chunk-0-0");
    expect(rebuiltGroundChunk.renderableCells).toHaveLength(EXPECTED_WORLD_STATS.instancesPerFlatChunk);
    expect(rebuiltGroundChunk.cellToInstance.has(changedCellIndex as number)).toBe(true);
    expect([...world.dirtyChunks]).toEqual([]);
  });

  it("constructs independent worlds without sharing typed arrays or dirty state", () => {
    const firstWorld = new VoxelWorld();
    const secondWorld = new VoxelWorld();

    firstWorld.setBlock(0, 0, 0, BLOCK_IDS.Ground);

    expect(secondWorld.getBlock(0, 0, 0)).toBe(BLOCK_IDS.Air);
    expect(firstWorld.blocks).not.toBe(secondWorld.blocks);
    expect(firstWorld.fluidTypes).not.toBe(secondWorld.fluidTypes);
    expect([...secondWorld.dirtyChunks]).toEqual([]);
    expect([...secondWorld.dirtyFluidChunks]).toEqual([]);
  });

  it("clones complete worlds without sharing terrain or fluid storage", () => {
    const world = createFlatVoxelWorld();
    world.setFluidSource(4, 1, 5, FLUID_IDS.Water);
    const cloned = world.clone();

    world.clearFluid(4, 1, 5);
    world.setBlock(4, 0, 5, BLOCK_IDS.Stone);

    expect(cloned.getFluid(4, 1, 5)).toMatchObject({ type: FLUID_IDS.Water, source: true });
    expect(cloned.getBlock(4, 0, 5)).toBe(BLOCK_IDS.Ground);
    expect(cloned.blocks).not.toBe(world.blocks);
    expect(cloned.fluidTypes).not.toBe(world.fluidTypes);
  });

  it("stores source and flowing water independently from terrain", () => {
    const world = createFlatVoxelWorld();

    expect(world.setFluidSource(4, 1, 5, FLUID_IDS.Water)).toBe(true);
    expect(world.getFluid(4, 1, 5)).toEqual({
      type: FLUID_IDS.Water,
      level: 0,
      source: true,
      falling: false,
      authored: true,
    });
    expect(world.getBlock(4, 1, 5)).toBe(BLOCK_IDS.Air);

    expect(world.setFluid(5, 1, 5, {
      type: FLUID_IDS.Water,
      level: 4,
      source: false,
      falling: false,
    })).toBe(true);
    expect(world.getFluid(5, 1, 5)).toMatchObject({ level: 4, source: false });
  });

  it("rejects invalid fluid writes and fluid inside solid terrain", () => {
    const world = createFlatVoxelWorld();

    expect(world.setFluidSource(4, 0, 5, FLUID_IDS.Water)).toBe(false);
    expect(world.setFluid(4, 1, 5, { type: FLUID_IDS.Water, level: 8, source: false, falling: false })).toBe(false);
    expect(world.setFluid(64, 1, 5, { type: FLUID_IDS.Water, level: 0, source: true, falling: false })).toBe(false);
    expect(world.getFluid(4, 0, 5)).toEqual(EMPTY_FLUID_CELL);
  });

  it("clears incompatible fluid when solid terrain is placed", () => {
    const world = createFlatVoxelWorld();
    world.setFluidSource(4, 1, 5, FLUID_IDS.Water);
    world.clearDirtyFluidChunks();

    world.setBlock(4, 1, 5, BLOCK_IDS.Stone);

    expect(world.getFluid(4, 1, 5)).toEqual(EMPTY_FLUID_CELL);
    expect([...world.dirtyFluidChunks]).toEqual(["chunk-0-0"]);
  });

  it("marks adjacent fluid chunks dirty at chunk boundaries", () => {
    const world = createFlatVoxelWorld();

    world.setFluidSource(15, 1, 16, FLUID_IDS.Water);

    expect(world.dirtyFluidChunks.has("chunk-0-1")).toBe(true);
    expect(world.dirtyFluidChunks.has("chunk-1-1")).toBe(true);
    expect(world.dirtyFluidChunks.has("chunk-0-0")).toBe(true);
  });

  it("clones and restores isolated fluid snapshots", () => {
    const world = createFlatVoxelWorld();
    world.setFluidSource(4, 1, 5, FLUID_IDS.Water);
    const snapshot = world.cloneFluidLayer();

    world.clearFluid(4, 1, 5);
    expect(world.getFluid(4, 1, 5)).toEqual(EMPTY_FLUID_CELL);
    expect(snapshot.types).not.toBe(world.fluidTypes);

    world.restoreFluidLayer(snapshot);

    expect(world.getFluid(4, 1, 5)).toMatchObject({ type: FLUID_IDS.Water, source: true });
    expect(world.dirtyFluidChunks.size).toBe(16);
  });

  it("copies constructor fluid arrays and validates their contents", () => {
    const types = new Uint8Array(WORLD_CELL_COUNT);
    const levels = new Uint8Array(WORLD_CELL_COUNT);
    const flags = new Uint8Array(WORLD_CELL_COUNT);
    const index = new VoxelWorld().getIndex(4, 1, 5) as number;
    types[index] = FLUID_IDS.Water;
    flags[index] = 1;

    const world = new VoxelWorld(
      WORLD_CONFIG,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      types,
      levels,
      flags,
    );
    types[index] = FLUID_IDS.None;

    expect(world.getFluid(4, 1, 5)).toMatchObject({ type: FLUID_IDS.Water, source: true });
    expect(world.fluidTypes).not.toBe(types);

    levels[index] = 8;
    expect(() => new VoxelWorld(
      WORLD_CONFIG,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      world.fluidTypes,
      levels,
      flags,
    )).toThrow(/Invalid fluid state/);
  });

  it("rejects restoring fluid into terrain that cannot contain it", () => {
    const world = createFlatVoxelWorld();
    const snapshot = world.cloneFluidLayer();
    const solidIndex = world.getIndex(4, 0, 5) as number;
    snapshot.types[solidIndex] = FLUID_IDS.Water;
    snapshot.flags[solidIndex] = 1;

    expect(() => world.restoreFluidLayer(snapshot)).toThrow(/Invalid fluid state/);
  });

  it("reports fluid diagnostics separately from solid terrain", () => {
    const world = createFlatVoxelWorld();
    world.setFluidSource(4, 1, 5, FLUID_IDS.Water);
    world.setFluid(5, 1, 5, { type: FLUID_IDS.Water, level: 1, source: false, falling: true });

    expect(world.getStats()).toMatchObject({
      fluidCells: 2,
      fluidSources: 1,
      fallingFluidCells: 1,
    });
  });

  it("matches the expected flat-world stats constants", () => {
    expect(createFlatVoxelWorld().getStats()).toEqual({
      logicalCells: EXPECTED_WORLD_STATS.logicalCells,
      airCells: EXPECTED_WORLD_STATS.airCells,
      nonAirBlocks: EXPECTED_WORLD_STATS.nonAirBlocks,
      zoneAssignments: 0,
      fluidCells: 0,
      fluidSources: 0,
      fallingFluidCells: 0,
      renderedInstances: EXPECTED_WORLD_STATS.renderedInstances,
      chunks: EXPECTED_WORLD_STATS.chunks,
    });
  });
});
