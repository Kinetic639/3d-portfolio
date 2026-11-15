import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { createFlatVoxelWorld } from "@/lib/world/voxel-world";
import { WORLD_CONFIG } from "@/lib/world/world-config";
import { buildSmoothSurface, filterSurface, type SmoothSurface } from "./smooth-mesher";

const config = { ...WORLD_CONFIG, width: 32, depth: 32 };
const whole = { minX: 0, maxX: 31, minZ: 0, maxZ: 31 };

function triangleNormalY(surface: SmoothSurface, triangle: number) {
  const [a, b, c] = [0, 1, 2].map((n) => surface.indices[triangle * 3 + n] * 3);
  const p = surface.positions;
  const ux = p[b] - p[a];
  const uz = p[b + 2] - p[a + 2];
  const vx = p[c] - p[a];
  const vz = p[c + 2] - p[a + 2];
  return uz * vx - ux * vz;
}

function triangleKeys(surface: SmoothSurface) {
  const keys = new Set<string>();
  for (let triangle = 0; triangle < surface.indices.length / 3; triangle += 1) {
    const corners = [0, 1, 2].map((n) => {
      const at = surface.indices[triangle * 3 + n] * 3;
      return [0, 1, 2].map((axis) => surface.positions[at + axis].toFixed(4)).join(",");
    });
    keys.add(corners.sort().join("|"));
  }
  return keys;
}

describe("smooth mesher", () => {
  it("leaves flat ground exactly at its height, facing up, with nothing beyond the world", () => {
    const world = createFlatVoxelWorld(config);
    const surface = buildSmoothSurface(world, whole);
    // 32 x 32 columns, two triangles each.
    expect(surface.indices.length / 3).toBe(32 * 32 * 2);
    for (let vertex = 0; vertex < surface.positions.length / 3; vertex += 1) {
      expect(surface.positions[vertex * 3 + 1]).toBeCloseTo(1, 5);
      expect(surface.normals[vertex * 3 + 1]).toBeCloseTo(1, 5);
      expect(Math.abs(surface.positions[vertex * 3])).toBeLessThanOrEqual(16.001);
    }
    for (let triangle = 0; triangle < surface.indices.length / 3; triangle += 1) {
      expect(triangleNormalY(surface, triangle)).toBeGreaterThan(0);
    }
  });

  it("turns a one-block step into a slope between the two levels", () => {
    const world = createFlatVoxelWorld(config);
    for (let z = 0; z < 32; z += 1) for (let x = 16; x < 32; x += 1) world.setBlock(x, 1, z, BLOCK_IDS.Ground);
    const surface = buildSmoothSurface(world, whole);
    const heights = new Set<number>();
    for (let vertex = 0; vertex < surface.positions.length / 3; vertex += 1) {
      const y = surface.positions[vertex * 3 + 1];
      expect(y).toBeGreaterThan(0.99);
      expect(y).toBeLessThan(2.01);
      heights.add(Number(y.toFixed(2)));
    }
    // Not just the two plateaus: there are vertices part-way up.
    expect([...heights].some((y) => y > 1.1 && y < 1.9)).toBe(true);
    // No vertical wall: every triangle still faces upward.
    for (let triangle = 0; triangle < surface.indices.length / 3; triangle += 1) {
      expect(triangleNormalY(surface, triangle)).toBeGreaterThan(0);
    }
  });

  it("colours the surface with the material on top", () => {
    const world = createFlatVoxelWorld(config);
    world.setBlock(10, 0, 10, BLOCK_IDS.Sand);
    const surface = buildSmoothSurface(world, whole);
    const distinct = new Set<string>();
    for (let vertex = 0; vertex < surface.colors.length / 3; vertex += 1) {
      distinct.add([0, 1, 2].map((axis) => surface.colors[vertex * 3 + axis].toFixed(3)).join(","));
    }
    // Ground everywhere (plus the map's centre marker), sand around one cell; never the stone underneath.
    expect(distinct.size).toBeGreaterThanOrEqual(2);
    expect(distinct.size).toBeLessThanOrEqual(3);
  });

  it("builds regions that fit together exactly", () => {
    const world = createFlatVoxelWorld(config);
    for (let z = 4; z < 28; z += 1) for (let x = 10; x < 22; x += 1) world.setBlock(x, 1 + ((x + z) % 3 === 0 ? 1 : 0), z, BLOCK_IDS.Stone);
    for (let z = 4; z < 28; z += 1) for (let x = 10; x < 22; x += 1) world.setBlock(x, 1, z, BLOCK_IDS.Stone);
    const full = triangleKeys(buildSmoothSurface(world, whole));
    const left = triangleKeys(buildSmoothSurface(world, { ...whole, maxX: 15 }));
    const right = triangleKeys(buildSmoothSurface(world, { ...whole, minX: 16 }));
    expect(left.size + right.size).toBe(full.size);
    for (const key of [...left, ...right]) expect(full.has(key)).toBe(true);
  });

  it("filters triangles by column and drops unused vertices", () => {
    const world = createFlatVoxelWorld(config);
    const surface = buildSmoothSurface(world, whole);
    const part = filterSurface(surface, (x, z) => x < 4 && z < 4);
    expect(part.indices.length / 3).toBe(4 * 4 * 2);
    expect(part.positions.length / 3).toBe(5 * 5);
  });
});
