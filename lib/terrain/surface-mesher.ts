import { getBlockDefinition, isRenderableBlock } from "@/lib/world/block-registry";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import type { GridCoordinate, WorldPosition } from "@/lib/world/world-config";

export type SurfaceMaterialFamily = "opaque";

export type SurfaceFaceDirection = "px" | "nx" | "py" | "ny" | "pz" | "nz";

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

type FaceDefinition = {
  direction: SurfaceFaceDirection;
  normal: [number, number, number];
  neighbourOffset: [number, number, number];
  corners: Array<[number, number, number]>;
};

const FACE_DEFINITIONS: FaceDefinition[] = [
  {
    direction: "px",
    normal: [1, 0, 0],
    neighbourOffset: [1, 0, 0],
    corners: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]],
  },
  {
    direction: "nx",
    normal: [-1, 0, 0],
    neighbourOffset: [-1, 0, 0],
    corners: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]],
  },
  {
    direction: "py",
    normal: [0, 1, 0],
    neighbourOffset: [0, 1, 0],
    corners: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]],
  },
  {
    direction: "ny",
    normal: [0, -1, 0],
    neighbourOffset: [0, -1, 0],
    corners: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]],
  },
  {
    direction: "pz",
    normal: [0, 0, 1],
    neighbourOffset: [0, 0, 1],
    corners: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]],
  },
  {
    direction: "nz",
    normal: [0, 0, -1],
    neighbourOffset: [0, 0, -1],
    corners: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]],
  },
];

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

        for (const face of FACE_DEFINITIONS) {
          const [dx, dy, dz] = face.neighbourOffset;
          if (occludesFace(world, x + dx, y + dy, z + dz)) {
            continue;
          }

          const worldPosition = world.gridToWorld(x, y, z);
          const vertexOffset = positions.length / 3;
          const color = hexToRgb(getBlockDefinition(blockId).developmentColor);
          const variation = ((x * 37 + z * 17 + y * 11) % 100) / 100;

          for (const corner of face.corners) {
            positions.push(
              worldPosition.x + corner[0] * SURFACE_BLOCK_SIZE,
              worldPosition.y + corner[1] * SURFACE_BLOCK_SIZE,
              worldPosition.z + corner[2] * SURFACE_BLOCK_SIZE,
            );
            normals.push(...face.normal);
            colors.push(...color);
            variations.push(variation);
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
    materialFamily: "opaque",
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    variations: new Float32Array(variations),
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

function occludesFace(world: VoxelWorld, x: number, y: number, z: number) {
  if (!world.isInsideWorld(x, y, z)) {
    return false;
  }

  const definition = getBlockDefinition(world.getBlock(x, y, z));
  return definition.renderable && definition.solid;
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
