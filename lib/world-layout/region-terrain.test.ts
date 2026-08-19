import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { VoxelWorld } from "@/lib/world/voxel-world";
import { ROTATIONS, SHAPE_IDS } from "@/lib/voxel-shapes/shape-ids";
import { buildRegionSurfaceMeshes, markRegionTerrainDirtyForCell } from "./region-terrain";

describe("region terrain seams", () => {
  it("culls hidden faces across the Center-to-North boundary", () => {
    const center = new VoxelWorld();
    const north = new VoxelWorld();
    center.setBlock(4, 2, 0, BLOCK_IDS.Ground);
    north.setBlock(4, 2, 63, BLOCK_IDS.Ground);
    const worlds = { center, north };

    const centerChunk = buildRegionSurfaceMeshes("center", worlds).chunks.find((chunk) => chunk.id === "center:chunk-0-0")!;
    const northChunk = buildRegionSurfaceMeshes("north", worlds).chunks.find((chunk) => chunk.id === "north:chunk-0-3")!;

    expect(centerChunk.faceMappings).not.toContainEqual({ cellIndex: center.getIndex(4, 2, 0), direction: "nz" });
    expect(northChunk.faceMappings).not.toContainEqual({ cellIndex: north.getIndex(4, 2, 63), direction: "pz" });
  });

  it("restores an exposed seam face and keeps partial-shape boundaries visible", () => {
    const center = new VoxelWorld();
    const north = new VoxelWorld();
    center.setBlock(4, 2, 0, BLOCK_IDS.Ground);
    const worlds = { center, north };

    let centerChunk = buildRegionSurfaceMeshes("center", worlds).chunks.find((chunk) => chunk.id === "center:chunk-0-0")!;
    expect(centerChunk.faceMappings).toContainEqual({ cellIndex: center.getIndex(4, 2, 0), direction: "nz" });

    north.setCell({
      x: 4,
      y: 2,
      z: 63,
      blockId: BLOCK_IDS.Stone,
      shapeId: SHAPE_IDS.SLAB,
      rotation: ROTATIONS.NORTH,
      state: 0,
      zoneId: 0,
    });
    centerChunk = buildRegionSurfaceMeshes("center", worlds).chunks.find((chunk) => chunk.id === "center:chunk-0-0")!;
    expect(centerChunk.faceMappings).toContainEqual({ cellIndex: center.getIndex(4, 2, 0), direction: "nz" });
  });

  it("uses continuous world positions and global texture variation", () => {
    const center = new VoxelWorld();
    const north = new VoxelWorld();
    center.setBlock(4, 2, 4, BLOCK_IDS.Ground);
    north.setBlock(4, 2, 4, BLOCK_IDS.Ground);
    const worlds = { center, north };

    const centerChunk = buildRegionSurfaceMeshes("center", worlds).chunks[0];
    const northChunk = buildRegionSurfaceMeshes("north", worlds).chunks[0];

    expect(centerChunk.id).toBe("center:chunk-0-0");
    expect(northChunk.id).toBe("north:chunk-0-0");
    expect(northChunk.boundingBox.min.z).toBe(centerChunk.boundingBox.min.z - 64);
    expect([...northChunk.variations]).not.toEqual([...centerChunk.variations]);
  });

  it("marks both internal boundary chunks dirty after a seam edit", () => {
    const center = new VoxelWorld();
    const north = new VoxelWorld();
    center.clearDirtyChunks();
    north.clearDirtyChunks();

    markRegionTerrainDirtyForCell({ center, north }, "north", { x: 4, z: 63 });

    expect(north.dirtyChunks).toEqual(new Set(["chunk-0-3"]));
    expect(center.dirtyChunks).toEqual(new Set(["chunk-0-0"]));
  });
});

