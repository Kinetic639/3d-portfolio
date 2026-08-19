import * as THREE from "three";
import { getShapeDefinition } from "@/lib/voxel-shapes/shape-registry";
import { isRenderableBlock } from "@/lib/world/block-registry";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import { getWorldMaxY, type GridCoordinate, type WorldPosition } from "@/lib/world/world-config";
import { getTerrainSurfaceAt } from "@/lib/world/surface-query";

export type ZoneOverlayChunkMeshData = {
  id: string;
  chunkX: number;
  chunkZ: number;
  zoneId: number;
  positions: Float32Array;
  indices: Uint32Array;
  boundaryPositions: Float32Array;
  cellCount: number;
  triangles: number;
  bounds: {
    min: GridCoordinate;
    max: GridCoordinate;
  };
  boundingBox: {
    min: WorldPosition;
    max: WorldPosition;
  };
};

export type ZoneOverlayBuildResult = {
  chunks: ZoneOverlayChunkMeshData[];
  totalTriangles: number;
  totalCells: number;
  buildMs: number;
};

const SURFACE_SCALE = 1.018;
const SURFACE_OFFSET = 0.018;
const BOUNDARY_OFFSET = 0.026;

export function buildZoneOverlayMeshes(world: VoxelWorld): ZoneOverlayBuildResult {
  const startedAt = now();
  const chunks: ZoneOverlayChunkMeshData[] = [];
  const chunksPerAxis = world.config.width / world.config.chunkSize;

  for (let chunkZ = 0; chunkZ < chunksPerAxis; chunkZ += 1) {
    for (let chunkX = 0; chunkX < chunksPerAxis; chunkX += 1) {
      chunks.push(...buildZoneOverlayChunkMeshes(world, chunkX, chunkZ));
    }
  }

  return {
    chunks,
    totalTriangles: chunks.reduce((sum, chunk) => sum + chunk.triangles, 0),
    totalCells: chunks.reduce((sum, chunk) => sum + chunk.cellCount, 0),
    buildMs: Number((now() - startedAt).toFixed(3)),
  };
}

export function buildZoneOverlayChunkMeshes(world: VoxelWorld, chunkX: number, chunkZ: number): ZoneOverlayChunkMeshData[] {
  const chunkSize = world.config.chunkSize;
  const minGridX = chunkX * chunkSize;
  const minGridZ = chunkZ * chunkSize;
  const maxGridX = minGridX + chunkSize - 1;
  const maxGridZ = minGridZ + chunkSize - 1;
  const builders = new Map<number, ChunkZoneBuilder>();

  for (let z = minGridZ; z <= maxGridZ; z += 1) {
    for (let x = minGridX; x <= maxGridX; x += 1) {
      const zoneId = world.getColumnZone(x, z);
      if (zoneId === 0) continue;
      const surface = getTerrainSurfaceAt(world, x, z);
      if (!surface.valid) continue;
      const blockId = world.getBlock(surface.grid.x, surface.grid.y, surface.grid.z);
      if (!isRenderableBlock(blockId)) continue;

      let builder = builders.get(zoneId);
      if (!builder) {
        builder = createBuilder();
        builders.set(zoneId, builder);
      }
      appendSurfaceFaces(builder, world, surface.grid);
      appendBoundaryLines(builder, world, surface.grid, zoneId);
      builder.cellCount += 1;
    }
  }

  return [...builders.entries()]
    .filter(([, builder]) => builder.positions.length > 0)
    .map(([zoneId, builder]) => {
      const baseId = world.getChunkId(chunkX, chunkZ);
      return {
        id: `${baseId}-zone-${zoneId}`,
        chunkX,
        chunkZ,
        zoneId,
        positions: new Float32Array(builder.positions),
        indices: new Uint32Array(builder.indices),
        boundaryPositions: new Float32Array(builder.boundaryPositions),
        cellCount: builder.cellCount,
        triangles: builder.indices.length / 3,
        bounds: {
          min: { x: minGridX, y: world.config.minY, z: minGridZ },
          max: { x: maxGridX, y: getWorldMaxY(world.config), z: maxGridZ },
        },
        boundingBox: {
          min: world.gridToWorld(minGridX, world.config.minY, minGridZ),
          max: world.gridToWorld(maxGridX, getWorldMaxY(world.config), maxGridZ),
        },
      };
    });
}

export function getDirtyZoneChunkIdsForColumns(world: VoxelWorld, columns: Array<Pick<GridCoordinate, "x" | "z">>) {
  const ids = new Set<string>();
  for (const column of columns) {
    const chunk = world.getChunkCoordinates(column.x, column.z);
    if (chunk) ids.add(world.getChunkId(chunk.chunkX, chunk.chunkZ));
  }
  return [...ids].sort();
}

function appendSurfaceFaces(builder: ChunkZoneBuilder, world: VoxelWorld, coordinate: GridCoordinate) {
  const worldPosition = world.gridToWorld(coordinate.x, coordinate.y, coordinate.z);
  const shape = getShapeDefinition(world.getShape(coordinate.x, coordinate.y, coordinate.z));
  const faces = shape.faces(world.getRotation(coordinate.x, coordinate.y, coordinate.z), world.getState(coordinate.x, coordinate.y, coordinate.z));

  for (const face of faces) {
    if (face.direction !== "py") continue;
    const vertexOffset = builder.positions.length / 3;
    const normal = new THREE.Vector3(...face.normal).normalize();
    for (const corner of face.corners) {
      builder.positions.push(
        worldPosition.x + corner[0] * SURFACE_SCALE + normal.x * SURFACE_OFFSET,
        worldPosition.y + corner[1] * SURFACE_SCALE + normal.y * SURFACE_OFFSET,
        worldPosition.z + corner[2] * SURFACE_SCALE + normal.z * SURFACE_OFFSET,
      );
    }
    builder.indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
  }
}

function appendBoundaryLines(builder: ChunkZoneBuilder, world: VoxelWorld, coordinate: GridCoordinate, zoneId: number) {
  const edges = [
    { neighbour: { x: coordinate.x - 1, z: coordinate.z }, from: [-0.5, -0.5] as const, to: [-0.5, 0.5] as const },
    { neighbour: { x: coordinate.x + 1, z: coordinate.z }, from: [0.5, 0.5] as const, to: [0.5, -0.5] as const },
    { neighbour: { x: coordinate.x, z: coordinate.z - 1 }, from: [0.5, -0.5] as const, to: [-0.5, -0.5] as const },
    { neighbour: { x: coordinate.x, z: coordinate.z + 1 }, from: [-0.5, 0.5] as const, to: [0.5, 0.5] as const },
  ];

  for (const edge of edges) {
    const neighbourZone = world.getColumnZone(edge.neighbour.x, edge.neighbour.z);
    const neighbourSurface = getTerrainSurfaceAt(world, edge.neighbour.x, edge.neighbour.z);
    if (neighbourZone === zoneId && neighbourSurface.valid) continue;
    appendBoundarySegment(builder, world, coordinate, edge.from, edge.to);
  }
}

function appendBoundarySegment(
  builder: ChunkZoneBuilder,
  world: VoxelWorld,
  coordinate: GridCoordinate,
  from: readonly [number, number],
  to: readonly [number, number],
) {
  const center = world.gridToWorld(coordinate.x, coordinate.y, coordinate.z);
  const fromSurface = sampleSurface(world, coordinate, from[0], from[1]);
  const toSurface = sampleSurface(world, coordinate, to[0], to[1]);
  builder.boundaryPositions.push(
    center.x + from[0] * SURFACE_SCALE,
    center.y + fromSurface.height * world.config.blockSize + BOUNDARY_OFFSET,
    center.z + from[1] * SURFACE_SCALE,
    center.x + to[0] * SURFACE_SCALE,
    center.y + toSurface.height * world.config.blockSize + BOUNDARY_OFFSET,
    center.z + to[1] * SURFACE_SCALE,
  );
}

function sampleSurface(world: VoxelWorld, coordinate: GridCoordinate, localX: number, localZ: number) {
  const shape = getShapeDefinition(world.getShape(coordinate.x, coordinate.y, coordinate.z));
  return shape.surfaceAt(localX, localZ, world.getRotation(coordinate.x, coordinate.y, coordinate.z), world.getState(coordinate.x, coordinate.y, coordinate.z));
}

type ChunkZoneBuilder = {
  positions: number[];
  indices: number[];
  boundaryPositions: number[];
  cellCount: number;
};

function createBuilder(): ChunkZoneBuilder {
  return {
    positions: [],
    indices: [],
    boundaryPositions: [],
    cellCount: 0,
  };
}

function now() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
