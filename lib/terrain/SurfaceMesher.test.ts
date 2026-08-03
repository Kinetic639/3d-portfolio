import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { VoxelWorld, createFlatVoxelWorld } from "@/lib/world/voxel-world";
import { WORLD_CONFIG } from "@/lib/world/world-config";
import { ROTATIONS, SHAPE_IDS } from "@/lib/voxel-shapes/shape-ids";
import { buildSurfaceChunkMesh } from "./surface-mesher";

describe("surface mesher", () => {
  it("emits six quads for one isolated block", () => {
    const world = new VoxelWorld();
    world.setBlock(1, 1, 1, BLOCK_IDS.Ground);

    const mesh = buildSurfaceChunkMesh(world, 0, 0);

    expect(mesh.visibleQuads).toBe(6);
    expect(mesh.triangles).toBe(12);
    expect(mesh.positions).toHaveLength(6 * 4 * 3);
    expect(mesh.indices).toHaveLength(6 * 6);
  });

  it("winds every face direction outward", () => {
    const world = new VoxelWorld();
    world.setBlock(1, 1, 1, BLOCK_IDS.Ground);
    const mesh = buildSurfaceChunkMesh(world, 0, 0);
    const expectedNormals = {
      px: [1, 0, 0],
      nx: [-1, 0, 0],
      py: [0, 1, 0],
      ny: [0, -1, 0],
      pz: [0, 0, 1],
      nz: [0, 0, -1],
    } as const;

    for (let faceIndex = 0; faceIndex < mesh.faceMappings.length; faceIndex += 1) {
      const expected = expectedNormals[mesh.faceMappings[faceIndex].direction];
      const triangleA = getTriangleNormal(mesh.positions, mesh.indices, faceIndex * 2);
      const triangleB = getTriangleNormal(mesh.positions, mesh.indices, faceIndex * 2 + 1);

      expect(dot(triangleA, expected)).toBeGreaterThan(0);
      expect(dot(triangleB, expected)).toBeGreaterThan(0);
      expect(dot(triangleA, triangleB)).toBeGreaterThan(0);
    }
  });

  it("removes the shared internal face between two adjacent blocks", () => {
    const world = new VoxelWorld();
    world.setBlock(1, 1, 1, BLOCK_IDS.Ground);
    world.setBlock(2, 1, 1, BLOCK_IDS.Ground);

    const mesh = buildSurfaceChunkMesh(world, 0, 0);

    expect(mesh.visibleQuads).toBe(10);
    expect(mesh.triangles).toBe(20);
  });

  it("generates no visible faces for a completely enclosed block", () => {
    const world = new VoxelWorld();
    world.setBlock(2, 2, 2, BLOCK_IDS.Special);
    world.setBlock(3, 2, 2, BLOCK_IDS.Ground);
    world.setBlock(1, 2, 2, BLOCK_IDS.Ground);
    world.setBlock(2, 3, 2, BLOCK_IDS.Ground);
    world.setBlock(2, 1, 2, BLOCK_IDS.Ground);
    world.setBlock(2, 2, 3, BLOCK_IDS.Ground);
    world.setBlock(2, 2, 1, BLOCK_IDS.Ground);

    const mesh = buildSurfaceChunkMesh(world, 0, 0);
    const enclosedIndex = world.getIndex(2, 2, 2);

    expect(enclosedIndex).not.toBeNull();
    expect(mesh.faceMappings.some((face) => face.cellIndex === enclosedIndex)).toBe(false);
  });

  it("emits only the exterior surface for a solid 2 by 2 by 2 volume", () => {
    const world = new VoxelWorld();
    for (let y = 1; y <= 2; y += 1) {
      for (let z = 1; z <= 2; z += 1) {
        for (let x = 1; x <= 2; x += 1) {
          world.setBlock(x, y, z, BLOCK_IDS.Ground);
        }
      }
    }

    const mesh = buildSurfaceChunkMesh(world, 0, 0);

    expect(mesh.visibleQuads).toBe(24);
    expect(mesh.triangles).toBe(48);
  });

  it("removes faces across chunk boundaries", () => {
    const world = new VoxelWorld();
    world.setBlock(15, 1, 1, BLOCK_IDS.Ground);
    world.setBlock(16, 1, 1, BLOCK_IDS.Ground);

    const leftChunk = buildSurfaceChunkMesh(world, 0, 0);
    const rightChunk = buildSurfaceChunkMesh(world, 1, 0);
    const leftIndex = world.getIndex(15, 1, 1);
    const rightIndex = world.getIndex(16, 1, 1);

    expect(leftChunk.visibleQuads).toBe(5);
    expect(rightChunk.visibleQuads).toBe(5);
    expect(leftChunk.faceMappings.find((face) => face.cellIndex === leftIndex && face.direction === "px")).toBeUndefined();
    expect(rightChunk.faceMappings.find((face) => face.cellIndex === rightIndex && face.direction === "nx")).toBeUndefined();
  });

  it("emits world-edge outward faces", () => {
    const world = new VoxelWorld();
    world.setBlock(0, 0, 0, BLOCK_IDS.Ground);

    const mesh = buildSurfaceChunkMesh(world, 0, 0);
    const cellIndex = world.getIndex(0, 0, 0);

    expect(mesh.faceMappings.filter((face) => face.cellIndex === cellIndex)).toHaveLength(6);
    expect(mesh.faceMappings.some((face) => face.direction === "nx")).toBe(true);
    expect(mesh.faceMappings.some((face) => face.direction === "ny")).toBe(true);
    expect(mesh.faceMappings.some((face) => face.direction === "nz")).toBe(true);
  });

  it("emits no geometry for air cells", () => {
    const world = new VoxelWorld();

    const mesh = buildSurfaceChunkMesh(world, 0, 0);

    expect(mesh.visibleQuads).toBe(0);
    expect(mesh.positions).toHaveLength(0);
    expect(mesh.indices).toHaveLength(0);
  });

  it("treats different opaque block types as occluding each other", () => {
    const world = new VoxelWorld();
    world.setBlock(1, 1, 1, BLOCK_IDS.Path);
    world.setBlock(2, 1, 1, BLOCK_IDS.Special);

    const mesh = buildSurfaceChunkMesh(world, 0, 0);

    expect(mesh.visibleQuads).toBe(10);
  });

  it("keeps visible partial faces when a cube neighbours a lower slab", () => {
    const world = new VoxelWorld();
    world.setBlock(1, 1, 1, BLOCK_IDS.Ground);
    world.setCell({ x: 2, y: 1, z: 1, blockId: BLOCK_IDS.Special, shapeId: SHAPE_IDS.SLAB, rotation: ROTATIONS.NORTH, state: 0, zoneId: 0 });

    const mesh = buildSurfaceChunkMesh(world, 0, 0);

    expect(mesh.faceMappings.some((face) => face.cellIndex === world.getIndex(1, 1, 1) && face.direction === "px")).toBe(true);
    expect(mesh.visibleQuads).toBeGreaterThan(10);
  });

  it("generates water geometry without occluding adjacent solid terrain", () => {
    const world = new VoxelWorld();
    world.setBlock(1, 1, 1, BLOCK_IDS.Ground);
    world.setCell({ x: 2, y: 1, z: 1, blockId: BLOCK_IDS.Water, shapeId: SHAPE_IDS.WATER, rotation: ROTATIONS.NORTH, state: 15, zoneId: 0 });

    const mesh = buildSurfaceChunkMesh(world, 0, 0);

    expect(mesh.faceMappings.some((face) => face.cellIndex === world.getIndex(1, 1, 1) && face.direction === "px")).toBe(true);
    expect(mesh.faceMappings.some((face) => face.cellIndex === world.getIndex(2, 1, 1))).toBe(true);
  });

  it("maps generated triangles back to the owning logical cell", () => {
    const world = new VoxelWorld();
    world.setBlock(1, 1, 1, BLOCK_IDS.Ground);

    const mesh = buildSurfaceChunkMesh(world, 0, 0);
    const cellIndex = world.getIndex(1, 1, 1);

    expect(mesh.triangleToCell).toHaveLength(12);
    expect([...mesh.triangleToCell].every((mappedCell) => mappedCell === cellIndex)).toBe(true);
  });

  it("calculates chunk bounds from chunk coordinates", () => {
    const world = createFlatVoxelWorld();

    const mesh = buildSurfaceChunkMesh(world, 1, 2);

    expect(mesh.bounds).toEqual({
      min: { x: 16, y: 0, z: 32 },
      max: { x: 31, y: WORLD_CONFIG.height - 1, z: 47 },
    });
    expect(mesh.boundingBox.min).toEqual(world.gridToWorld(16, 0, 32));
    expect(mesh.boundingBox.max).toEqual(world.gridToWorld(31, WORLD_CONFIG.height - 1, 47));
  });

  it("does not mutate logical world data while rebuilding", () => {
    const world = createFlatVoxelWorld();
    const beforeBlocks = new Uint16Array(world.blocks);
    const beforeZones = new Uint8Array(world.zones);

    buildSurfaceChunkMesh(world, 0, 0);

    expect(world.blocks).toEqual(beforeBlocks);
    expect(world.zones).toEqual(beforeZones);
  });
});

function getTriangleNormal(positions: Float32Array, indices: Uint32Array, triangleIndex: number) {
  const indexOffset = triangleIndex * 3;
  const a = getVertex(positions, indices[indexOffset]);
  const b = getVertex(positions, indices[indexOffset + 1]);
  const c = getVertex(positions, indices[indexOffset + 2]);
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];

  return [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ] as const;
}

function getVertex(positions: Float32Array, vertexIndex: number) {
  const offset = vertexIndex * 3;
  return [positions[offset], positions[offset + 1], positions[offset + 2]] as const;
}

function dot(left: readonly number[], right: readonly number[]) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}
