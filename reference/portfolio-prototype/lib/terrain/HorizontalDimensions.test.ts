import { describe, expect, it } from "vitest";
import { FLUID_IDS } from "@/lib/fluids/fluid-types";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { VoxelWorld } from "@/lib/world/voxel-world";
import { WORLD_CONFIG } from "@/lib/world/world-config";
import { buildSurfaceChunkMeshes } from "./surface-mesher";
import { buildWaterChunkMeshes } from "./water-mesher";
import { buildZoneOverlayMeshes } from "./zone-overlay";

describe("configurable horizontal terrain dimensions", () => {
  it("meshes independent X and Z chunk counts", () => {
    const world = new VoxelWorld({ ...WORLD_CONFIG, width: 32, depth: 16 });
    world.setBlock(20, 0, 8, BLOCK_IDS.Ground);
    world.setFluidSource(20, 1, 8, FLUID_IDS.Water);
    world.setColumnZone(20, 8, 1);

    const surface = buildSurfaceChunkMeshes(world);
    const water = buildWaterChunkMeshes(world);
    const zones = buildZoneOverlayMeshes(world);

    expect(surface.chunks.map((chunk) => chunk.id)).toEqual(["chunk-0-0", "chunk-1-0"]);
    expect(water.chunks.map((chunk) => chunk.id)).toEqual(["water-chunk-0-0", "water-chunk-1-0"]);
    expect(zones.chunks).toHaveLength(1);
    expect(zones.chunks[0].id).toContain("chunk-1-0");
  });
});
