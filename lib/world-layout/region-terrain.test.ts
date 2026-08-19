import { describe, expect, it } from "vitest";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { VoxelWorld } from "@/lib/world/voxel-world";
import { ROTATIONS, SHAPE_IDS } from "@/lib/voxel-shapes/shape-ids";
import { buildRegionSurfaceMeshes, markRegionTerrainDirtyForCell } from "./region-terrain";
import type { WorldRegionId } from "./world-layout-types";

describe("region terrain seams", () => {
  it.each([
    ["north", { x: 4, z: 0 }, { x: 4, z: 63 }, "nz", "pz"],
    ["south", { x: 4, z: 63 }, { x: 4, z: 0 }, "pz", "nz"],
    ["west", { x: 0, z: 4 }, { x: 63, z: 4 }, "nx", "px"],
    ["east", { x: 63, z: 4 }, { x: 0, z: 4 }, "px", "nx"],
  ] as const)("culls hidden faces across the Center-to-%s boundary", (regionId, centerCell, neighborCell, centerDirection, neighborDirection) => {
    const center = new VoxelWorld();
    const neighbor = new VoxelWorld();
    center.setBlock(centerCell.x, 2, centerCell.z, BLOCK_IDS.Ground);
    neighbor.setBlock(neighborCell.x, 2, neighborCell.z, BLOCK_IDS.Ground);
    const worlds = { center, [regionId]: neighbor };

    const centerChunks = buildRegionSurfaceMeshes("center", worlds).chunks;
    const neighborChunks = buildRegionSurfaceMeshes(regionId, worlds).chunks;
    expect(centerChunks.flatMap((chunk) => chunk.faceMappings)).not.toContainEqual({ cellIndex: center.getIndex(centerCell.x, 2, centerCell.z), direction: centerDirection });
    expect(neighborChunks.flatMap((chunk) => chunk.faceMappings)).not.toContainEqual({ cellIndex: neighbor.getIndex(neighborCell.x, 2, neighborCell.z), direction: neighborDirection });
  });

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

  it("places every corner region at a unique continuous world position", () => {
    const regionIds = ["north-west", "north-east", "south-west", "south-east"] as const;
    const worlds = Object.fromEntries(regionIds.map((id) => {
      const world = new VoxelWorld();
      world.setBlock(0, 2, 0, BLOCK_IDS.Ground);
      return [id, world];
    })) as Partial<Record<WorldRegionId, VoxelWorld>>;

    const corners = regionIds.map((regionId) => {
      const chunk = buildRegionSurfaceMeshes(regionId, worlds).chunks[0];
      return [chunk.id, chunk.boundingBox.min.x, chunk.boundingBox.min.z];
    });

    expect(new Set(corners.map(([id]) => id)).size).toBe(4);
    expect(new Set(corners.map(([, x, z]) => `${x},${z}`)).size).toBe(4);
  });
});
