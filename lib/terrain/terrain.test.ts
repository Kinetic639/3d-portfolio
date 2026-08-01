import { describe, expect, it } from "vitest";
import {
  CHUNK_INSTANCE_COUNT,
  TERRAIN_CHUNK_COUNT,
  TERRAIN_INSTANCE_COUNT,
  createTerrainData,
  distanceFromCenterPlatform,
} from "./terrain";

describe("createTerrainData", () => {
  it("creates 16 chunks with 256 surface instances each", () => {
    const terrain = createTerrainData();

    expect(terrain.chunks).toHaveLength(TERRAIN_CHUNK_COUNT);
    expect(terrain.instanceCount).toBe(TERRAIN_INSTANCE_COUNT);
    expect(terrain.logicalCellCount).toBe(49_152);
    expect(terrain.airCellCount).toBe(45_056);
    expect(terrain.nonAirBlockCount).toBe(4_096);
    expect(terrain.chunks.every((chunk) => chunk.cells.length === CHUNK_INSTANCE_COUNT)).toBe(true);
  });

  it("marks exactly the compact 2 x 2 center platform as loader blocks", () => {
    const terrain = createTerrainData();

    expect(terrain.centerCells).toHaveLength(4);
    expect(terrain.centerCells.map((cell) => `${cell.x},${cell.z}`).sort()).toEqual([
      "31,31",
      "31,32",
      "32,31",
      "32,32",
    ]);
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
