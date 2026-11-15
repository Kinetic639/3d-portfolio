import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "./block-registry";
import { raycastVoxels } from "./voxel-raycast";
import { createFlatVoxelWorld, VoxelWorld } from "./voxel-world";

describe("voxel raycast", () => {
  it("hits the flat ground straight below", () => {
    const world = createFlatVoxelWorld();
    const above = world.gridToWorld(10, 0, 20);
    const hit = raycastVoxels(world, { x: above.x, y: 30, z: above.z }, { x: 0, y: -1, z: 0 });
    expect(hit?.cell).toEqual({ x: 10, y: 0, z: 20 });
    // The top face of the y=0 layer is at world y = 1.
    expect(hit?.distance).toBeCloseTo(29, 3);
    expect(hit?.point.y).toBeCloseTo(1, 3);
  });

  it("stops at the first block along a slanted ray", () => {
    const world = createFlatVoxelWorld();
    world.setBlock(12, 3, 20, BLOCK_IDS.Stone);
    const target = world.gridToWorld(12, 3, 20);
    const origin = { x: target.x - 8, y: target.y + 8, z: target.z };
    const hit = raycastVoxels(world, origin, { x: 1, y: -1, z: 0 });
    expect(hit?.cell).toEqual({ x: 12, y: 3, z: 20 });
  });

  it("enters the world from outside its bounds", () => {
    const world = createFlatVoxelWorld();
    const edge = world.gridToWorld(0, 0, 5);
    const hit = raycastVoxels(world, { x: edge.x - 50, y: 0.5, z: edge.z }, { x: 1, y: 0, z: 0 });
    expect(hit?.cell).toEqual({ x: 0, y: 0, z: 5 });
  });

  it("returns null for rays that miss, point away or run out of range", () => {
    const world = createFlatVoxelWorld();
    expect(raycastVoxels(world, { x: 0, y: 5, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull();
    expect(raycastVoxels(world, { x: 500, y: 50, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
    expect(raycastVoxels(world, { x: 0, y: 15, z: 0 }, { x: 0, y: -1, z: 0 }, 5)).toBeNull();
    expect(raycastVoxels(world, { x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 0 })).toBeNull();
  });

  it("passes through an empty world", () => {
    const world = new VoxelWorld();
    expect(raycastVoxels(world, { x: 0, y: 30, z: 0 }, { x: 0.2, y: -1, z: 0.1 })).toBeNull();
  });

  it("agrees with a brute-force march on arbitrary rays", () => {
    const world = createFlatVoxelWorld();
    for (let index = 0; index < 40; index += 1) {
      world.setBlock(20 + (index * 7) % 23, 1 + (index % 4), 18 + (index * 5) % 19, BLOCK_IDS.Stone);
    }
    for (let index = 0; index < 25; index += 1) {
      const origin = { x: -6 + index * 0.7, y: 14 + (index % 5), z: 9 - index * 0.4 };
      const direction = { x: 0.3 - index * 0.02, y: -1, z: -0.6 + index * 0.03 };
      const hit = raycastVoxels(world, origin, direction);
      const length = Math.hypot(direction.x, direction.y, direction.z);
      let expected: { x: number; y: number; z: number } | null = null;
      for (let distance = 0; distance < 80 && !expected; distance += 0.002) {
        const cell = world.worldToGrid({
          x: origin.x + (direction.x / length) * distance,
          y: origin.y + (direction.y / length) * distance,
          z: origin.z + (direction.z / length) * distance,
        });
        if (cell && world.getBlock(cell.x, cell.y, cell.z) !== BLOCK_IDS.Air) expected = cell;
      }
      expect(hit?.cell ?? null).toEqual(expected);
    }
  });
});
