import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "./block-registry";
import { EXPECTED_WORLD_STATS, VoxelWorld, createFlatVoxelWorld } from "./voxel-world";
import { WORLD_CELL_COUNT, WORLD_CONFIG, WORLD_SURFACE_CELL_COUNT, WORLD_AIR_CELL_COUNT } from "./world-config";
import { ROTATIONS, SHAPE_IDS } from "@/lib/voxel-shapes/shape-ids";

describe("voxel world foundation", () => {
  it("allocates the complete logical volume in a compact typed array", () => {
    const world = createFlatVoxelWorld();

    expect(world.blocks).toBeInstanceOf(Uint16Array);
    expect(world.shapes).toBeInstanceOf(Uint8Array);
    expect(world.rotations).toBeInstanceOf(Uint8Array);
    expect(world.states).toBeInstanceOf(Uint8Array);
    expect(world.blocks).toHaveLength(WORLD_CELL_COUNT);
    expect(world.shapes).toHaveLength(WORLD_CELL_COUNT);
    expect(world.rotations).toHaveLength(WORLD_CELL_COUNT);
    expect(world.states).toHaveLength(WORLD_CELL_COUNT);
    expect(world.getStats().logicalCells).toBe(49_152);
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

  it("generates a deterministic flat ground layer and leaves upper cells as air", () => {
    const world = createFlatVoxelWorld();
    const stats = world.getStats();

    expect(stats.nonAirBlocks).toBe(WORLD_SURFACE_CELL_COUNT);
    expect(stats.renderedInstances).toBe(4_096);
    expect(stats.airCells).toBe(WORLD_AIR_CELL_COUNT);
    expect(world.getBlock(0, 0, 0)).toBe(BLOCK_IDS.Ground);
    expect(world.getBlock(0, 1, 0)).toBe(BLOCK_IDS.Air);
  });

  it("maps every logical coordinate to a unique valid flat-array index", () => {
    const world = createFlatVoxelWorld();
    const indexes = new Set<number>();
    let invalidIndexCount = 0;

    for (let y = 0; y < WORLD_CONFIG.height; y += 1) {
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

    expect(world.getCoordinates(0)).toEqual({ x: 0, y: 0, z: 0 });
    expect(world.getCoordinates(63)).toEqual({ x: 63, y: 0, z: 0 });
    expect(world.getCoordinates(64)).toEqual({ x: 0, y: 0, z: 1 });
    expect(world.getCoordinates(4_096)).toEqual({ x: 0, y: 1, z: 0 });
    expect(world.getCoordinates(WORLD_CELL_COUNT - 1)).toEqual({ x: 63, y: 11, z: 63 });
  });

  it("rejects out-of-bounds coordinates safely", () => {
    const world = createFlatVoxelWorld();

    expect(world.isInsideWorld(-1, 0, 0)).toBe(false);
    expect(world.getIndex(64, 0, 0)).toBeNull();
    expect(world.getCoordinates(WORLD_CELL_COUNT)).toBeNull();
    expect(world.getBlock(0, 12, 0)).toBe(BLOCK_IDS.Air);
    expect(world.setBlock(0, 12, 0, BLOCK_IDS.Ground)).toBe(false);
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
    expect(chunks.every((chunk) => chunk.renderableCells.length === 256)).toBe(true);
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
    expect(world.getStats().renderedInstances).toBe(4_096);

    expect(world.setBlock(2, 0, 3, BLOCK_IDS.Air)).toBe(true);

    const airRebuild = world.rebuildDirtyChunks();
    const rebuiltAirChunk = airRebuild[0];

    expect(world.getStats().renderedInstances).toBe(4_095);
    expect(airRebuild).toHaveLength(1);
    expect(rebuiltAirChunk.id).toBe("chunk-0-0");
    expect(rebuiltAirChunk.renderableCells).toHaveLength(255);
    expect(rebuiltAirChunk.cellToInstance.has(changedCellIndex as number)).toBe(false);
    expect([...world.dirtyChunks]).toEqual([]);

    rebuiltAirChunk.renderableCells.forEach((cell, instanceId) => {
      expect(rebuiltAirChunk.instanceToCell[instanceId]).toBe(cell.cellIndex);
      expect(rebuiltAirChunk.cellToInstance.get(cell.cellIndex)).toBe(instanceId);
    });

    expect(world.setBlock(2, 0, 3, BLOCK_IDS.Ground)).toBe(true);

    const groundRebuild = world.rebuildDirtyChunks();
    const rebuiltGroundChunk = groundRebuild[0];

    expect(world.getStats().renderedInstances).toBe(4_096);
    expect(groundRebuild).toHaveLength(1);
    expect(rebuiltGroundChunk.id).toBe("chunk-0-0");
    expect(rebuiltGroundChunk.renderableCells).toHaveLength(256);
    expect(rebuiltGroundChunk.cellToInstance.has(changedCellIndex as number)).toBe(true);
    expect([...world.dirtyChunks]).toEqual([]);
  });

  it("constructs independent worlds without sharing typed arrays or dirty state", () => {
    const firstWorld = new VoxelWorld();
    const secondWorld = new VoxelWorld();

    firstWorld.setBlock(0, 0, 0, BLOCK_IDS.Ground);

    expect(secondWorld.getBlock(0, 0, 0)).toBe(BLOCK_IDS.Air);
    expect(firstWorld.blocks).not.toBe(secondWorld.blocks);
    expect([...secondWorld.dirtyChunks]).toEqual([]);
  });

  it("matches the expected flat-world stats constants", () => {
    expect(createFlatVoxelWorld().getStats()).toEqual({
      logicalCells: EXPECTED_WORLD_STATS.logicalCells,
      airCells: EXPECTED_WORLD_STATS.airCells,
      nonAirBlocks: EXPECTED_WORLD_STATS.nonAirBlocks,
      zoneAssignments: 0,
      renderedInstances: EXPECTED_WORLD_STATS.renderedInstances,
      chunks: EXPECTED_WORLD_STATS.chunks,
    });
  });
});
