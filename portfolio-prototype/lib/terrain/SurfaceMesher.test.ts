import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { VoxelWorld, createFlatVoxelWorld } from "@/lib/world/voxel-world";
import { getWorldMaxY, WORLD_CONFIG } from "@/lib/world/world-config";
import { ROTATIONS, SHAPE_IDS } from "@/lib/voxel-shapes/shape-ids";
import { FLUID_IDS } from "@/lib/fluids/fluid-types";
import { buildSurfaceChunkMesh } from "./surface-mesher";

describe("surface mesher", () => {
  it("emits six quads for one isolated block", () => {
    const world = new VoxelWorld();
    world.setBlock(1, 1, 1, BLOCK_IDS.Ground);

    const mesh = buildSurfaceChunkMesh(world, 0, 0);

    expect(mesh.visibleQuads).toBe(6);
    expect(mesh.triangles).toBe(12);
    expect(mesh.positions).toHaveLength(6 * 4 * 3);
    expect(mesh.uvs).toHaveLength(6 * 4 * 2);
    expect(mesh.textureKinds).toHaveLength(6 * 4);
    expect(mesh.textureVariants).toHaveLength(6 * 4);
    expect(mesh.uvRotations).toHaveLength(6 * 4);
    expect(mesh.uvMirrors).toHaveLength(6 * 4);
    expect(mesh.indices).toHaveLength(6 * 6);
  });

  it("assigns grass top, grass side, dirt bottom, and path-dirt textures", () => {
    const world = new VoxelWorld();
    world.setBlock(1, 1, 1, BLOCK_IDS.Ground);
    world.setBlock(3, 1, 1, BLOCK_IDS.Path);

    const mesh = buildSurfaceChunkMesh(world, 0, 0);
    const groundIndex = world.getIndex(1, 1, 1);
    const pathIndex = world.getIndex(3, 1, 1);

    for (let faceIndex = 0; faceIndex < mesh.faceMappings.length; faceIndex += 1) {
      const face = mesh.faceMappings[faceIndex];
      const textureKind = mesh.textureKinds[faceIndex * 4];
      if (face.cellIndex === pathIndex) expect(textureKind).toBe(6);
      if (face.cellIndex !== groundIndex) continue;
      if (face.direction === "py") expect(textureKind).toBe(1);
      else if (face.direction === "ny") expect(textureKind).toBe(3);
      else expect(textureKind).toBe(2);
    }
  });

  it("maps selectable material block ids to their texture families", () => {
    const cases = [
      [BLOCK_IDS.Dirt, 3],
      [BLOCK_IDS.Stone, 4],
      [BLOCK_IDS.MossyStone, 5],
      [BLOCK_IDS.PathDirt, 6],
      [BLOCK_IDS.WoodPlanks, 7],
      [BLOCK_IDS.Sand, 8],
      [BLOCK_IDS.Riverbed, 9],
    ] as const;
    const world = new VoxelWorld();
    cases.forEach(([blockId], index) => world.setBlock(index * 2 + 1, 1, 1, blockId));

    const mesh = buildSurfaceChunkMesh(world, 0, 0);
    cases.forEach(([blockId, textureKind], index) => {
      const cellIndex = world.getIndex(index * 2 + 1, 1, 1);
      const faceIndex = mesh.faceMappings.findIndex((face) => face.cellIndex === cellIndex);
      expect(blockId).toBeGreaterThan(BLOCK_IDS.LoaderOrigin);
      expect(mesh.textureKinds[faceIndex * 4]).toBe(textureKind);
    });
  });

  it("maps the top of every grass side face to the top of the side texture", () => {
    const world = new VoxelWorld();
    world.setBlock(1, 1, 1, BLOCK_IDS.Ground);
    const mesh = buildSurfaceChunkMesh(world, 0, 0);

    for (let faceIndex = 0; faceIndex < mesh.faceMappings.length; faceIndex += 1) {
      const face = mesh.faceMappings[faceIndex];
      if (face.direction === "py" || face.direction === "ny") continue;

      const vertexOffset = faceIndex * 4;
      const faceYs = Array.from({ length: 4 }, (_, index) => mesh.positions[(vertexOffset + index) * 3 + 1]);
      const faceVs = Array.from({ length: 4 }, (_, index) => mesh.uvs[(vertexOffset + index) * 2 + 1]);
      const maxY = Math.max(...faceYs);

      for (let index = 0; index < 4; index += 1) {
        if (faceYs[index] === maxY) expect(faceVs[index]).toBe(1);
      }
    }
  });

  it("renders a covered ground block as dirt without changing its block id", () => {
    const world = new VoxelWorld();
    world.setBlock(1, 1, 1, BLOCK_IDS.Ground);
    world.setBlock(1, 2, 1, BLOCK_IDS.Ground);
    const lowerIndex = world.getIndex(1, 1, 1);

    const mesh = buildSurfaceChunkMesh(world, 0, 0);
    for (let faceIndex = 0; faceIndex < mesh.faceMappings.length; faceIndex += 1) {
      if (mesh.faceMappings[faceIndex].cellIndex !== lowerIndex) continue;
      expect(mesh.textureKinds[faceIndex * 4]).toBe(3);
    }
    expect(world.getBlock(1, 1, 1)).toBe(BLOCK_IDS.Ground);
  });

  it("keeps grass sides when the shape above does not fully cover the top", () => {
    const world = new VoxelWorld();
    world.setBlock(1, 1, 1, BLOCK_IDS.Ground);
    world.setCell({ x: 1, y: 2, z: 1, blockId: BLOCK_IDS.Special, shapeId: SHAPE_IDS.RUBBLE_SMALL, rotation: ROTATIONS.NORTH, state: 0, zoneId: 0 });
    const lowerIndex = world.getIndex(1, 1, 1);

    const mesh = buildSurfaceChunkMesh(world, 0, 0);
    const lowerSideKinds = mesh.faceMappings.flatMap((face, faceIndex) => (
      face.cellIndex === lowerIndex && face.direction !== "py" && face.direction !== "ny"
        ? [mesh.textureKinds[faceIndex * 4]]
        : []
    ));

    expect(lowerSideKinds.length).toBeGreaterThan(0);
    expect(lowerSideKinds.every((kind) => kind === 2)).toBe(true);
  });

  it("assigns deterministic texture variants and safe grass-side transforms", () => {
    const world = createFlatVoxelWorld();
    const first = buildSurfaceChunkMesh(world, 0, 0);
    const second = buildSurfaceChunkMesh(world, 0, 0);

    expect(first.textureVariants).toEqual(second.textureVariants);
    expect(first.uvRotations).toEqual(second.uvRotations);
    expect(first.uvMirrors).toEqual(second.uvMirrors);

    const topVariants = new Set<number>();
    const sideVariants = new Set<number>();
    const topRotations = new Set<number>();
    const sideMirrors = new Set<number>();
    for (let faceIndex = 0; faceIndex < first.faceMappings.length; faceIndex += 1) {
      const vertexIndex = faceIndex * 4;
      const direction = first.faceMappings[faceIndex].direction;
      if (direction === "py") {
        topVariants.add(first.textureVariants[vertexIndex]);
        topRotations.add(first.uvRotations[vertexIndex]);
      } else if (direction !== "ny" && first.textureKinds[vertexIndex] === 2) {
        sideVariants.add(first.textureVariants[vertexIndex]);
        sideMirrors.add(first.uvMirrors[vertexIndex]);
        expect(first.uvRotations[vertexIndex]).toBe(0);
      }
    }

    expect(topVariants.size).toBeGreaterThan(1);
    expect(sideVariants.size).toBeGreaterThan(1);
    expect(topRotations.size).toBeGreaterThan(1);
    expect(sideMirrors).toEqual(new Set([0, 1]));
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

  it("does not treat independent fluid cells as opaque terrain geometry", () => {
    const world = new VoxelWorld();
    world.setBlock(1, 1, 1, BLOCK_IDS.Ground);
    world.setFluidSource(2, 1, 1, FLUID_IDS.Water);

    const mesh = buildSurfaceChunkMesh(world, 0, 0);

    expect(mesh.faceMappings.some((face) => face.cellIndex === world.getIndex(1, 1, 1) && face.direction === "px")).toBe(true);
    expect(mesh.faceMappings.some((face) => face.cellIndex === world.getIndex(2, 1, 1))).toBe(false);
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
      min: { x: 16, y: WORLD_CONFIG.minY, z: 32 },
      max: { x: 31, y: getWorldMaxY(), z: 47 },
    });
    expect(mesh.boundingBox.min).toEqual(world.gridToWorld(16, WORLD_CONFIG.minY, 32));
    expect(mesh.boundingBox.max).toEqual(world.gridToWorld(31, getWorldMaxY(), 47));
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
