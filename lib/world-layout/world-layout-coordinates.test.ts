import { describe, expect, it } from "vitest";
import { WORLD_CONFIG } from "@/lib/world/world-config";
import { WORLD_REGION_IDS } from "./world-layout-types";
import {
  globalCellToRegionCell,
  regionCellToGlobalCell,
  regionCellToInternalChunk,
  regionCellToWorldPosition,
  worldPositionToRegionCell,
} from "./world-layout-coordinates";

describe("world layout coordinates", () => {
  it("round-trips every corner of every region", () => {
    for (const regionId of WORLD_REGION_IDS) {
      for (const x of [0, WORLD_CONFIG.width - 1]) {
        for (const y of [0, WORLD_CONFIG.height - 1]) {
          for (const z of [0, WORLD_CONFIG.depth - 1]) {
            const local = { x, y, z };
            const global = regionCellToGlobalCell(regionId, local);
            expect(global).not.toBeNull();
            expect(globalCellToRegionCell(global!)).toEqual({ regionId, local });
            expect(worldPositionToRegionCell(regionCellToWorldPosition(regionId, local)!)).toEqual({ regionId, local });
          }
        }
      }
    }
  });

  it("preserves the existing center world positions exactly", () => {
    expect(regionCellToWorldPosition("center", { x: 0, y: 0, z: 0 })).toEqual({ x: -31.5, y: 0.5, z: -31.5 });
    expect(regionCellToWorldPosition("center", { x: 63, y: 0, z: 63 })).toEqual({ x: 31.5, y: 0.5, z: 31.5 });
  });

  it("places cardinal region boundaries one cell apart", () => {
    expect(regionCellToGlobalCell("north", { x: 31, y: 0, z: 63 })).toEqual({ x: 31, y: 0, z: -1 });
    expect(regionCellToGlobalCell("center", { x: 31, y: 0, z: 0 })).toEqual({ x: 31, y: 0, z: 0 });
    expect(regionCellToGlobalCell("center", { x: 63, y: 0, z: 31 })).toEqual({ x: 63, y: 0, z: 31 });
    expect(regionCellToGlobalCell("east", { x: 0, y: 0, z: 31 })).toEqual({ x: 64, y: 0, z: 31 });
  });

  it("resolves diagonal transitions and rejects positions outside the layout", () => {
    expect(globalCellToRegionCell({ x: -1, y: 0, z: -1 })).toEqual({
      regionId: "north-west",
      local: { x: 63, y: 0, z: 63 },
    });
    expect(globalCellToRegionCell({ x: 128, y: 0, z: 0 })).toBeNull();
    expect(globalCellToRegionCell({ x: 0, y: 12, z: 0 })).toBeNull();
  });

  it("maps region-local cells through the existing internal chunk grid", () => {
    expect(regionCellToInternalChunk({ x: 0, z: 0 })).toEqual({ chunkX: 0, chunkZ: 0, localX: 0, localZ: 0 });
    expect(regionCellToInternalChunk({ x: 63, z: 63 })).toEqual({ chunkX: 3, chunkZ: 3, localX: 15, localZ: 15 });
    expect(regionCellToInternalChunk({ x: 64, z: 0 })).toBeNull();
  });
});
