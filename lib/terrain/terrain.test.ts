import { describe, expect, it } from "vitest";
import {
  CHUNK_INSTANCE_COUNT,
  TERRAIN_CHUNK_COUNT,
  TERRAIN_INSTANCE_COUNT,
  createTerrainData,
  distanceFromCenterPlatform,
} from "./terrain";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { WORLD_AIR_CELL_COUNT, WORLD_CELL_COUNT, WORLD_FOUNDATION_CELL_COUNT } from "@/lib/world/world-config";

describe("createTerrainData", () => {
  it("creates 16 chunks containing the generated stone foundation", () => {
    const terrain = createTerrainData();

    expect(terrain.chunks).toHaveLength(TERRAIN_CHUNK_COUNT);
    expect(terrain.instanceCount).toBe(TERRAIN_INSTANCE_COUNT);
    expect(terrain.logicalCellCount).toBe(WORLD_CELL_COUNT);
    expect(terrain.airCellCount).toBe(WORLD_AIR_CELL_COUNT);
    expect(terrain.nonAirBlockCount).toBe(WORLD_FOUNDATION_CELL_COUNT);
    expect(terrain.chunks.every((chunk) => chunk.cells.length === CHUNK_INSTANCE_COUNT)).toBe(true);
  });

  it("marks exactly the compact 2 x 2 center loader platform as loader blocks", () => {
    const terrain = createTerrainData();

    expect(terrain.centerCells).toHaveLength(4);
    expect(terrain.centerCells.map((cell) => `${cell.x},${cell.z}`).sort()).toEqual([
      "31,31",
      "31,32",
      "32,31",
      "32,32",
    ]);
    expect(terrain.centerCells.every((cell) => cell.blockId === BLOCK_IDS.LoaderOrigin)).toBe(true);
  });

  it("assigns zero delay to center cells and larger delays toward corners", () => {
    const terrain = createTerrainData();
    const centerCell = terrain.centerCells[0];
    const cornerCell = terrain.chunks[0].cells[0];

    expect(centerCell.expansionDelay).toBe(0);
    expect(cornerCell.expansionDelay).toBeGreaterThan(0.7);
    expect(distanceFromCenterPlatform(31, 31)).toBe(0);
  });
});
