import { describe, expect, it } from "vitest";
import { BLOCK_IDS, getBlockDefinition } from "@/lib/world/block-registry";
import { createFlatVoxelWorld } from "@/lib/world/voxel-world";
import { CHUNK_MAX_INSTANCE_COUNT, createTerrainData, toTerrainChunk } from "./terrain";

describe("dirty chunk rebuilds", () => {
  it("rebuilding one chunk preserves all other chunk data", () => {
    const terrain = createTerrainData();
    const untouchedChunk = terrain.chunks.find((chunk) => chunk.id === "chunk-1-0");

    terrain.world.setBlock(2, 0, 3, BLOCK_IDS.Air);
    const rebuilt = terrain.world.rebuildDirtyChunks().map(toTerrainChunk);

    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0].id).toBe("chunk-0-0");
    expect(rebuilt[0].cells).toHaveLength(255);
    expect(terrain.chunks.find((chunk) => chunk.id === "chunk-1-0")).toBe(untouchedChunk);
  });

  it("keeps exact instance mappings after removal and addition", () => {
    const world = createFlatVoxelWorld();
    const removedIndex = world.getIndex(2, 0, 3);
    const addedIndex = world.getIndex(2, 1, 3);

    world.setBlock(2, 0, 3, BLOCK_IDS.Air);
    const removedChunk = toTerrainChunk(world.rebuildDirtyChunks()[0]);
    world.setBlock(2, 1, 3, BLOCK_IDS.Special);
    const addedChunk = toTerrainChunk(world.rebuildDirtyChunks()[0]);

    expect(removedChunk.cellToInstance.has(removedIndex as number)).toBe(false);
    expect(addedChunk.cellToInstance.has(addedIndex as number)).toBe(true);

    addedChunk.cells.forEach((cell, instanceId) => {
      expect(addedChunk.instanceToCell[instanceId]).toBe(cell.cellIndex);
      expect(addedChunk.cellToInstance.get(cell.cellIndex)).toBe(instanceId);
    });
  });

  it("maps block registry colors into terrain instance data", () => {
    const world = createFlatVoxelWorld();
    world.setBlock(2, 0, 3, BLOCK_IDS.Path);

    const chunk = toTerrainChunk(world.rebuildDirtyChunks()[0]);
    const cell = chunk.cells.find((candidate) => candidate.x === 2 && candidate.y === 0 && candidate.z === 3);
    const expectedPathColor = getBlockDefinition(BLOCK_IDS.Path).developmentColor;
    const expectedRed = Number.parseInt(expectedPathColor.slice(1, 3), 16) / 255;

    expect(cell?.blockId).toBe(BLOCK_IDS.Path);
    expect(cell?.color[0]).toBeCloseTo(expectedRed);
  });

  it("keeps default ground neutral for blank authoring maps", () => {
    const terrain = createTerrainData();
    const chunk = terrain.chunks[0];
    const cell = chunk.cells.find((candidate) => candidate.x === 2 && candidate.y === 0 && candidate.z === 3);

    expect(getBlockDefinition(BLOCK_IDS.Ground).developmentColor).toBe("#8a8a8a");
    expect(cell?.blockId).toBe(BLOCK_IDS.Ground);
    expect(cell?.color).toEqual([0x8a / 255, 0x8a / 255, 0x8a / 255]);
  });

  it("documents the renderer capacity strategy", () => {
    expect(CHUNK_MAX_INSTANCE_COUNT).toBe(16 * 16 * 12);
  });
});
