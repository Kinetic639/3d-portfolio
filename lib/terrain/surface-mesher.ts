import { BLOCK_IDS, getBlockDefinition, isRenderableBlock } from "@/lib/world/block-registry";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import type { GridCoordinate, WorldPosition } from "@/lib/world/world-config";
import { computeExpansionDelay, isLoaderPlatformTopCell } from "@/lib/world/reveal";
import { FACE_NEIGHBOUR_OFFSETS, getShapeDefinition, type FaceDirection, type ShapeFace } from "@/lib/voxel-shapes/shape-registry";
import { SHAPE_IDS } from "@/lib/voxel-shapes/shape-ids";

export type SurfaceMaterialFamily = "opaque" | "water";

export type SurfaceFaceDirection = FaceDirection;

export type SurfaceFaceMapping = {
  cellIndex: number;
  direction: SurfaceFaceDirection;
};

export type SurfaceChunkMeshData = {
  id: string;
  chunkX: number;
  chunkZ: number;
  materialFamily: SurfaceMaterialFamily;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  variations: Float32Array;
  // Per-vertex reveal-animation data, mirroring the instanced cube-reveal
  // path's per-instance attributes (see voxel-world.ts's RenderableCell) so
  // this shape-accurate mesh can grow in with the exact same timing instead
  // of standing in as a plain cube until the reveal finishes.
  revealDelays: Float32Array;
  cellOrigins: Float32Array;
  centerFlags: Float32Array;
  indices: Uint32Array;
  faceMappings: SurfaceFaceMapping[];
  triangleToCell: Uint32Array;
  visibleQuads: number;
  triangles: number;
  bounds: {
    min: GridCoordinate;
    max: GridCoordinate;
  };
  boundingBox: {
    min: WorldPosition;
    max: WorldPosition;
  };
  buildMs: number;
};

const SURFACE_BLOCK_SIZE = 1.01;

export function buildSurfaceChunkMesh(world: VoxelWorld, chunkX: number, chunkZ: number): SurfaceChunkMeshData {
  const startedAt = now();
  const chunkSize = world.config.chunkSize;
  const minGridX = chunkX * chunkSize;
  const minGridZ = chunkZ * chunkSize;
  const maxGridX = minGridX + chunkSize - 1;
  const maxGridZ = minGridZ + chunkSize - 1;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const variations: number[] = [];
  const revealDelays: number[] = [];
  const cellOrigins: number[] = [];
  const centerFlags: number[] = [];
  const indices: number[] = [];
  const faceMappings: SurfaceFaceMapping[] = [];
  const triangleCells: number[] = [];

  for (let y = 0; y < world.config.height; y += 1) {
    for (let z = minGridZ; z <= maxGridZ; z += 1) {
      for (let x = minGridX; x <= maxGridX; x += 1) {
        const blockId = world.getBlock(x, y, z);
        if (!isRenderableBlock(blockId)) {
          continue;
        }

        const cellIndex = world.getIndex(x, y, z);
        if (cellIndex === null) {
          continue;
        }

        const shapeId = world.getShape(x, y, z);
        const rotation = world.getRotation(x, y, z);
        const state = world.getState(x, y, z);
        const shape = getShapeDefinition(shapeId);
        const shapeFaces = shape.faces(rotation, state);

        // Position-based, not block/material-based — see isLoaderPlatformTopCell.
        // The loader platform keeps its own fixed look below regardless of
        // whatever block or material ends up painted onto that cell.
        const isLoaderPlatformCell = isLoaderPlatformTopCell(world, x, y, z);

        for (const face of shapeFaces) {
          const [dx, dy, dz] = FACE_NEIGHBOUR_OFFSETS[face.direction];
          // The loader-platform cells (the 4 blocks shown during the
          // boot/loading intro) always draw every face, regardless of
          // neighbors, the same way the instanced cube-reveal path always
          // drew a complete cube for them — static occlusion culling is
          // computed once from the final settled world, so without this
          // exception these cells would render as if already flush with
          // their neighbors and the whole intro platform would disappear.
          if (!isLoaderPlatformCell && occludesFace(world, x + dx, y + dy, z + dz, face)) {
            continue;
          }

          const worldPosition = world.gridToWorld(x, y, z);
          const vertexOffset = positions.length / 3;
          const color = hexToRgb(
            isLoaderPlatformCell
              ? getBlockDefinition(BLOCK_IDS.LoaderOrigin).developmentColor
              : getBlockDefinition(blockId).developmentColor,
          );
          const variation = ((x * 37 + z * 17 + y * 11) % 100) / 100;
          const revealDelay = computeExpansionDelay(world, x, y, z);
          const centerFlag = isLoaderPlatformCell ? 1 : 0;

          for (const corner of face.corners) {
            positions.push(
              worldPosition.x + corner[0] * SURFACE_BLOCK_SIZE,
              worldPosition.y + corner[1] * SURFACE_BLOCK_SIZE,
              worldPosition.z + corner[2] * SURFACE_BLOCK_SIZE,
            );
            normals.push(...face.normal);
            colors.push(...color);
            variations.push(variation);
            revealDelays.push(revealDelay);
            // The point each vertex grows outward from — this cell's own
            // center, not the corner-offset vertex position — so the reveal
            // animation scales each shape from its own footprint regardless
            // of how asymmetric/off-center that shape's geometry is.
            cellOrigins.push(worldPosition.x, worldPosition.y, worldPosition.z);
            centerFlags.push(centerFlag);
          }

          indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
          faceMappings.push({ cellIndex, direction: face.direction });
          triangleCells.push(cellIndex, cellIndex);
        }
      }
    }
  }

  const bounds = {
    min: { x: minGridX, y: 0, z: minGridZ },
    max: { x: maxGridX, y: world.config.height - 1, z: maxGridZ },
  };

  return {
    id: world.getChunkId(chunkX, chunkZ),
    chunkX,
    chunkZ,
    materialFamily: positions.length > 0 && faceMappings.every((face) => {
      const coordinate = world.getCoordinates(face.cellIndex);
      return coordinate ? world.getShape(coordinate.x, coordinate.y, coordinate.z) === SHAPE_IDS.WATER : false;
    }) ? "water" : "opaque",
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    variations: new Float32Array(variations),
    revealDelays: new Float32Array(revealDelays),
    cellOrigins: new Float32Array(cellOrigins),
    centerFlags: new Float32Array(centerFlags),
    indices: new Uint32Array(indices),
    faceMappings,
    triangleToCell: new Uint32Array(triangleCells),
    visibleQuads: faceMappings.length,
    triangles: faceMappings.length * 2,
    bounds,
    boundingBox: {
      min: world.gridToWorld(minGridX, 0, minGridZ),
      max: world.gridToWorld(maxGridX, world.config.height - 1, maxGridZ),
    },
    buildMs: Number((now() - startedAt).toFixed(3)),
  };
}

export function buildSurfaceChunkMeshes(world: VoxelWorld) {
  const startedAt = now();
  const chunks: SurfaceChunkMeshData[] = [];
  const chunksPerAxis = world.config.width / world.config.chunkSize;

  for (let chunkZ = 0; chunkZ < chunksPerAxis; chunkZ += 1) {
    for (let chunkX = 0; chunkX < chunksPerAxis; chunkX += 1) {
      chunks.push(buildSurfaceChunkMesh(world, chunkX, chunkZ));
    }
  }

  return {
    chunks,
    totalBuildMs: Number((now() - startedAt).toFixed(3)),
  };
}

function occludesFace(world: VoxelWorld, x: number, y: number, z: number, face: ShapeFace) {
  if (!world.isInsideWorld(x, y, z)) {
    return false;
  }

  const definition = getBlockDefinition(world.getBlock(x, y, z));
  if (!definition.renderable || !definition.solid || face.occlusion !== "full") {
    return false;
  }

  const neighbourShape = getShapeDefinition(world.getShape(x, y, z));
  if (neighbourShape.fluid || !neighbourShape.solid) {
    return false;
  }

  return neighbourShape.faces(world.getRotation(x, y, z), world.getState(x, y, z)).some((neighbourFace) => (
    neighbourFace.occlusion === "full" &&
    neighbourFace.direction === oppositeDirection(face.direction)
  ));
}

function oppositeDirection(direction: SurfaceFaceDirection): SurfaceFaceDirection {
  switch (direction) {
    case "px": return "nx";
    case "nx": return "px";
    case "py": return "ny";
    case "ny": return "py";
    case "pz": return "nz";
    case "nz": return "pz";
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const normalizedHex = hex.replace("#", "");
  const value = Number.parseInt(normalizedHex, 16);

  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

function now() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
