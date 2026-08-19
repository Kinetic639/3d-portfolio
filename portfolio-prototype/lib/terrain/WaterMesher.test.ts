import { describe, expect, it } from "vitest";
import { FLUID_IDS } from "@/lib/fluids/fluid-types";
import { VoxelWorld } from "@/lib/world/voxel-world";
import { buildWaterChunkMesh, getWaterCornerHeight, getWaterFlowVector } from "./water-mesher";
import { createTerrainDataFromWorld } from "./terrain";

describe("water mesher", () => {
  it("builds a top and four exposed sides for an isolated source", () => {
    const world = new VoxelWorld();
    world.setFluidSource(2, 2, 2, FLUID_IDS.Water);
    const mesh = buildWaterChunkMesh(world, 0, 0);

    expect(mesh.visibleQuads).toBe(5);
    expect(mesh.triangles).toBe(10);
    expect(mesh.positions).toHaveLength(5 * 4 * 3);
    expect(mesh.flowVectors).toHaveLength(5 * 4 * 2);
    expect(mesh.triangleToCell).toHaveLength(10);
  });

  it("removes internal faces between adjacent full water cells", () => {
    const world = new VoxelWorld();
    world.setFluidSource(2, 2, 2, FLUID_IDS.Water);
    world.setFluidSource(3, 2, 2, FLUID_IDS.Water);
    const mesh = buildWaterChunkMesh(world, 0, 0);

    expect(mesh.visibleQuads).toBe(8);
    expect(mesh.faceMappings.some((face) => face.cellIndex === world.getIndex(2, 2, 2) && face.direction === "px")).toBe(false);
    expect(mesh.faceMappings.some((face) => face.cellIndex === world.getIndex(3, 2, 2) && face.direction === "nx")).toBe(false);
  });

  it("uses identical shared corner heights across chunk boundaries", () => {
    const world = new VoxelWorld();
    world.setFluidSource(15, 2, 8, FLUID_IDS.Water);
    world.setFluid(16, 2, 8, { type: FLUID_IDS.Water, level: 3, source: false, falling: false });

    expect(getWaterCornerHeight(world, 15, 2, 8, 1, 1)).toBeCloseTo(getWaterCornerHeight(world, 16, 2, 8, -1, 1), 6);
    expect(getWaterCornerHeight(world, 15, 2, 8, 1, -1)).toBeCloseTo(getWaterCornerHeight(world, 16, 2, 8, -1, -1), 6);
    const left = buildWaterChunkMesh(world, 0, 0);
    const right = buildWaterChunkMesh(world, 1, 0);
    expect(left.positions.length).toBeGreaterThan(0);
    expect(right.positions.length).toBeGreaterThan(0);
    const sharedX = world.gridToWorld(15, 2, 8).x + 0.5;
    const leftSharedYs = vertexYsAtX(left.positions, sharedX);
    const rightSharedYs = vertexYsAtX(right.positions, sharedX);
    expect(leftSharedYs.length).toBeGreaterThan(0);
    expect(rightSharedYs.length).toBeGreaterThan(0);
    expect(leftSharedYs.some((height) => rightSharedYs.includes(height))).toBe(true);
  });

  it("creates sloped surfaces and a normalized flow vector toward lower water", () => {
    const world = new VoxelWorld();
    world.setFluidSource(4, 2, 4, FLUID_IDS.Water);
    world.setFluid(5, 2, 4, { type: FLUID_IDS.Water, level: 4, source: false, falling: false });
    const flow = getWaterFlowVector(world, 4, 2, 4);
    const mesh = buildWaterChunkMesh(world, 0, 0);
    const topFace = mesh.faceMappings.findIndex((face) => face.cellIndex === world.getIndex(4, 2, 4) && face.direction === "py");
    const yValues = Array.from({ length: 4 }, (_, index) => mesh.positions[(topFace * 4 + index) * 3 + 1]);

    expect(flow[0]).toBeGreaterThan(0);
    expect(Math.hypot(...flow)).toBeCloseTo(1, 6);
    expect(new Set(yValues).size).toBeGreaterThan(1);
  });

  it("emits waterfall sides and marks falling vertices", () => {
    const world = new VoxelWorld();
    world.setFluid(4, 4, 4, { type: FLUID_IDS.Water, level: 0, source: false, falling: true });
    world.setFluid(4, 3, 4, { type: FLUID_IDS.Water, level: 0, source: false, falling: true });
    const mesh = buildWaterChunkMesh(world, 0, 0);

    expect(mesh.faceMappings.some((face) => face.direction !== "py")).toBe(true);
    expect([...mesh.fallingFlags].every((flag) => flag === 1)).toBe(true);
    expect([...mesh.flowVectors].some((value) => value === -1)).toBe(true);
  });

  it("maps every generated triangle back to its fluid cell", () => {
    const world = new VoxelWorld();
    world.setFluidSource(2, 2, 2, FLUID_IDS.Water);
    const cellIndex = world.getIndex(2, 2, 2);
    const mesh = buildWaterChunkMesh(world, 0, 0);

    expect([...mesh.triangleToCell].every((value) => value === cellIndex)).toBe(true);
  });

  it("does not mutate terrain or fluid state while meshing", () => {
    const world = new VoxelWorld();
    world.setFluidSource(2, 2, 2, FLUID_IDS.Water);
    const beforeBlocks = new Uint16Array(world.blocks);
    const beforeFluid = world.cloneFluidLayer();
    buildWaterChunkMesh(world, 0, 0);

    expect(world.blocks).toEqual(beforeBlocks);
    expect(world.fluidTypes).toEqual(beforeFluid.types);
    expect(world.fluidLevels).toEqual(beforeFluid.levels);
    expect(world.fluidFlags).toEqual(beforeFluid.flags);
  });

  it("integrates independent water chunks into terrain data", () => {
    const world = new VoxelWorld();
    world.setFluidSource(2, 2, 2, FLUID_IDS.Water);
    const terrain = createTerrainDataFromWorld(world);

    expect(terrain.waterChunks).toHaveLength(16);
    expect(terrain.waterQuadCount).toBe(5);
    expect(terrain.waterTriangleCount).toBe(10);
    expect(terrain.surfaceQuadCount).toBe(0);
  });
});

function vertexYsAtX(positions: Float32Array, targetX: number) {
  const heights: number[] = [];
  for (let offset = 0; offset < positions.length; offset += 3) {
    if (Math.abs(positions[offset] - targetX) < 0.0001) heights.push(positions[offset + 1]);
  }
  return heights;
}
