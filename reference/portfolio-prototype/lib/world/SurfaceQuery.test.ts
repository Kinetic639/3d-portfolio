import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "./block-registry";
import { getTerrainSurfaceAt, getTerrainSurfaceAtWorld } from "./surface-query";
import { createFlatVoxelWorld } from "./voxel-world";
import { ROTATIONS, SHAPE_IDS } from "@/lib/voxel-shapes/shape-ids";
import { FLUID_IDS } from "@/lib/fluids/fluid-types";

describe("shape-aware terrain surface queries", () => {
  it("returns the full cube top surface", () => {
    const world = createFlatVoxelWorld();
    const surface = getTerrainSurfaceAt(world, 31, 31);

    expect(surface.valid).toBe(true);
    if (!surface.valid) return;
    expect(surface.surfaceY).toBe(1);
    expect(surface.shapeId).toBe(SHAPE_IDS.CUBE);
    expect(surface.solidSupport).toBe(true);
    expect(surface.walkable).toBe(true);
  });

  it("returns lower and upper slab support heights", () => {
    const world = createFlatVoxelWorld();
    world.setCell({ x: 31, y: 1, z: 31, blockId: BLOCK_IDS.Special, shapeId: SHAPE_IDS.SLAB, rotation: ROTATIONS.NORTH, state: 0, zoneId: 0 });
    const lower = getTerrainSurfaceAt(world, 31, 31);
    world.setCell({ x: 31, y: 1, z: 31, blockId: BLOCK_IDS.Special, shapeId: SHAPE_IDS.SLAB, rotation: ROTATIONS.NORTH, state: 1, zoneId: 0 });
    const upper = getTerrainSurfaceAt(world, 31, 31);

    expect(lower.valid && lower.surfaceY).toBe(1.5);
    expect(upper.valid && upper.surfaceY).toBe(2);
  });

  it("keeps fluid independent from the supporting terrain surface", () => {
    const world = createFlatVoxelWorld();
    world.setFluidSource(31, 1, 31, FLUID_IDS.Water);
    const surface = getTerrainSurfaceAt(world, 31, 31);

    expect(surface.valid).toBe(true);
    if (!surface.valid) return;
    expect(surface.fluid).toBe(false);
    expect(surface.solidSupport).toBe(true);
    expect(surface.walkable).toBe(true);
    expect(world.getFluid(31, 1, 31).source).toBe(true);
  });

  it("works from negative and positive centered world coordinates", () => {
    const world = createFlatVoxelWorld();

    expect(getTerrainSurfaceAtWorld(world, { x: -31.5, z: -31.5 }).valid).toBe(true);
    expect(getTerrainSurfaceAtWorld(world, { x: 31.49, z: 31.49 }).valid).toBe(true);
  });
});
