import { BLOCK_IDS, getBlockDefinition } from "@/lib/world/block-registry";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import { getChunkCounts, getWorldMaxY, type GridCoordinate, type WorldPosition } from "@/lib/world/world-config";
import { computeExpansionDelay, isLoaderPlatformTopCell } from "@/lib/world/reveal";
import { FACE_NEIGHBOUR_OFFSETS, getShapeDefinition, type FaceDirection, type ShapeFace } from "@/lib/voxel-shapes/shape-registry";

export const SURFACE_TEXTURE_KINDS = {
  None: 0,
  GrassTop: 1,
  GrassSide: 2,
  Dirt: 3,
  Stone: 4,
  MossyStone: 5,
  PathDirt: 6,
  WoodPlanks: 7,
  Sand: 8,
  Riverbed: 9,
} as const;

export type SurfaceFaceDirection = FaceDirection;

export type SurfaceFaceMapping = {
  cellIndex: number;
  direction: SurfaceFaceDirection;
};

export type SurfaceChunkMeshData = {
  id: string;
  chunkX: number;
  chunkZ: number;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  textureKinds: Float32Array;
  textureVariants: Float32Array;
  uvRotations: Float32Array;
  uvMirrors: Float32Array;
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

/**
 * Shape faces depend only on (shape, rotation, state), and meshing asks for
 * them for every solid cell and each of its six neighbours. Building them
 * once per combination, with the occlusion facts the mesher needs, is what
 * keeps a chunk rebuild cheap enough to run inside an editor brush stroke.
 */
type CachedShape = {
  faces: ShapeFace[];
  /** Solid, non-fluid shapes are the only ones that can hide a neighbour's face. */
  occluder: boolean;
  /** Directions in which this shape presents a full face. */
  fullFaces: Set<FaceDirection>;
};

const shapeCache = new Map<number, CachedShape>();

function getCachedShape(shapeId: number, rawRotation: number, state: number): CachedShape {
  const rotation = rawRotation > 3 ? 0 : rawRotation;
  const key = (shapeId << 12) | (rotation << 8) | state;
  let cached = shapeCache.get(key);
  if (!cached) {
    const shape = getShapeDefinition(shapeId);
    const faces = shape.faces(rotation as Parameters<typeof shape.faces>[0], state);
    cached = {
      faces,
      occluder: shape.solid && !shape.fluid,
      fullFaces: new Set(faces.filter((face) => face.occlusion === "full").map((face) => face.direction)),
    };
    shapeCache.set(key, cached);
  }
  return cached;
}

/** Per block id: OCCLUDING is 1 when the block is renderable and solid, i.e. able to hide a neighbour's face. */
const RENDERABLE_BLOCK = new Uint8Array(65536);
const OCCLUDING_BLOCK = new Uint8Array(65536);
for (let blockId = 0; blockId < 256; blockId += 1) {
  const definition = getBlockDefinition(blockId);
  RENDERABLE_BLOCK[blockId] = definition.renderable ? 1 : 0;
  OCCLUDING_BLOCK[blockId] = definition.renderable && definition.solid ? 1 : 0;
}

const OPPOSITE: Record<FaceDirection, FaceDirection> = { px: "nx", nx: "px", py: "ny", ny: "py", pz: "nz", nz: "pz" };
const blockColorCache = new Map<number, [number, number, number]>();

function getBlockColor(blockId: number) {
  let color = blockColorCache.get(blockId);
  if (!color) {
    color = hexToRgb(getBlockDefinition(blockId).developmentColor);
    blockColorCache.set(blockId, color);
  }
  return color;
}

export type SurfaceMeshOptions = {
  /**
   * Only positions, normals, colours and indices are filled; every other
   * array is left empty. That is all the renderer draws today, and skipping
   * the rest roughly halves the cost of a chunk rebuild.
   */
  renderOnly?: boolean;
};

const faceUvCache = new WeakMap<ShapeFace, Array<[number, number]>>();

function getFaceUvs(face: ShapeFace) {
  let uvs = faceUvCache.get(face);
  if (!uvs) {
    uvs = buildFaceUvs(face);
    faceUvCache.set(face, uvs);
  }
  return uvs;
}

export function buildSurfaceChunkMesh(world: VoxelWorld, chunkX: number, chunkZ: number, options: SurfaceMeshOptions = {}): SurfaceChunkMeshData {
  const full = !options.renderOnly;
  const startedAt = now();
  const chunkSize = world.config.chunkSize;
  const minGridX = chunkX * chunkSize;
  const minGridZ = chunkZ * chunkSize;
  const maxGridX = minGridX + chunkSize - 1;
  const maxGridZ = minGridZ + chunkSize - 1;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const textureKinds: number[] = [];
  const textureVariants: number[] = [];
  const uvRotations: number[] = [];
  const uvMirrors: number[] = [];
  const colors: number[] = [];
  const variations: number[] = [];
  const revealDelays: number[] = [];
  const cellOrigins: number[] = [];
  const centerFlags: number[] = [];
  const indices: number[] = [];
  const faceMappings: SurfaceFaceMapping[] = [];
  const triangleCells: number[] = [];
  let quadCount = 0;

  // The loop visits every cell of the chunk, so it reads the world's arrays directly.
  const { width, depth, minY } = world.config;
  const maxY = getWorldMaxY(world.config);
  const centreMinX = width / 2 - 1;
  const centreMinZ = depth / 2 - 1;

  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minGridZ; z <= maxGridZ; z += 1) {
      const rowIndex = width * (z + depth * (y - minY));
      for (let x = minGridX; x <= maxGridX; x += 1) {
        const cellIndex = rowIndex + x;
        const blockId = world.blocks[cellIndex];
        if (RENDERABLE_BLOCK[blockId] === 0) {
          continue;
        }

        const shapeId = world.shapes[cellIndex];
        const rotation = world.rotations[cellIndex];
        const state = world.states[cellIndex];
        const shapeFaces = getCachedShape(shapeId, rotation, state).faces;
        const grassTopCovered = full && blockId === BLOCK_IDS.Ground && isCellTopFullyCovered(world, x, y, z);

        // Position-based, not block/material-based — see isLoaderPlatformTopCell.
        // The loader platform keeps its own fixed look below regardless of
        // whatever block or material ends up painted onto that cell.
        const isLoaderPlatformCell =
          x >= centreMinX && x <= centreMinX + 1 && z >= centreMinZ && z <= centreMinZ + 1 && isLoaderPlatformTopCell(world, x, y, z);
        let revealDelay = -1;
        let worldPosition: WorldPosition | null = null;

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

          worldPosition ??= world.gridToWorld(x, y, z);
          const vertexOffset = positions.length / 3;
          const color = getBlockColor(isLoaderPlatformCell ? BLOCK_IDS.LoaderOrigin : blockId);
          const [nx, ny, nz] = face.normal;
          for (const corner of face.corners) {
            positions.push(
              worldPosition.x + corner[0] * SURFACE_BLOCK_SIZE,
              worldPosition.y + corner[1] * SURFACE_BLOCK_SIZE,
              worldPosition.z + corner[2] * SURFACE_BLOCK_SIZE,
            );
            normals.push(nx, ny, nz);
            colors.push(color[0], color[1], color[2]);
          }

          if (full) {
            const variation = ((x * 37 + z * 17 + y * 11) % 100) / 100;
            const textureKind = isLoaderPlatformCell
              ? SURFACE_TEXTURE_KINDS.None
              : getSurfaceTextureKind(blockId, face.direction, grassTopCovered);
            const textureVariation = getTextureVariation(x, y, z, textureKind);
            const faceUvs = getFaceUvs(face);
            // Per cell, computed on its first visible face: most cells are buried and never need it.
            if (revealDelay < 0) revealDelay = computeExpansionDelay(world, x, y, z);
            const centerFlag = isLoaderPlatformCell ? 1 : 0;

            for (let cornerIndex = 0; cornerIndex < face.corners.length; cornerIndex += 1) {
              uvs.push(faceUvs[cornerIndex][0], faceUvs[cornerIndex][1]);
              textureKinds.push(textureKind);
              textureVariants.push(textureVariation.variant);
              uvRotations.push(textureVariation.rotation);
              uvMirrors.push(textureVariation.mirror);
              variations.push(variation);
              revealDelays.push(revealDelay);
              // The point each vertex grows outward from: this cell's own
              // centre, not the corner-offset vertex position, so the reveal
              // animation scales each shape from its own footprint.
              cellOrigins.push(worldPosition.x, worldPosition.y, worldPosition.z);
              centerFlags.push(centerFlag);
            }
            faceMappings.push({ cellIndex, direction: face.direction });
            triangleCells.push(cellIndex, cellIndex);
          }
          quadCount += 1;

          indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
        }
      }
    }
  }

  const bounds = {
    min: { x: minGridX, y: world.config.minY, z: minGridZ },
    max: { x: maxGridX, y: getWorldMaxY(world.config), z: maxGridZ },
  };

  return {
    id: world.getChunkId(chunkX, chunkZ),
    chunkX,
    chunkZ,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    textureKinds: new Float32Array(textureKinds),
    textureVariants: new Float32Array(textureVariants),
    uvRotations: new Float32Array(uvRotations),
    uvMirrors: new Float32Array(uvMirrors),
    colors: new Float32Array(colors),
    variations: new Float32Array(variations),
    revealDelays: new Float32Array(revealDelays),
    cellOrigins: new Float32Array(cellOrigins),
    centerFlags: new Float32Array(centerFlags),
    indices: new Uint32Array(indices),
    faceMappings,
    triangleToCell: new Uint32Array(triangleCells),
    visibleQuads: quadCount,
    triangles: quadCount * 2,
    bounds,
    boundingBox: {
      min: world.gridToWorld(minGridX, world.config.minY, minGridZ),
      max: world.gridToWorld(maxGridX, getWorldMaxY(world.config), maxGridZ),
    },
    buildMs: Number((now() - startedAt).toFixed(3)),
  };
}

function buildFaceUvs(face: ShapeFace): Array<[number, number]> {
  const projected = face.corners.map(([x, y, z]) => {
    switch (face.direction) {
      case "px": return [-z, y] as const;
      case "nx": return [z, y] as const;
      case "py": return [x, -z] as const;
      case "ny": return [x, z] as const;
      case "pz": return [x, y] as const;
      case "nz": return [-x, y] as const;
    }
  });
  const minU = Math.min(...projected.map(([u]) => u));
  const maxU = Math.max(...projected.map(([u]) => u));
  const minV = Math.min(...projected.map(([, v]) => v));
  const maxV = Math.max(...projected.map(([, v]) => v));
  const width = maxU - minU || 1;
  const height = maxV - minV || 1;

  return projected.map(([u, v]) => [
    (u - minU) / width,
    (v - minV) / height,
  ]);
}

function getSurfaceTextureKind(blockId: number, direction: SurfaceFaceDirection, grassTopCovered: boolean) {
  if (blockId === BLOCK_IDS.Ground) {
    if (grassTopCovered) return SURFACE_TEXTURE_KINDS.Dirt;
    if (direction === "py") return SURFACE_TEXTURE_KINDS.GrassTop;
    if (direction === "ny") return SURFACE_TEXTURE_KINDS.Dirt;
    return SURFACE_TEXTURE_KINDS.GrassSide;
  }

  if (blockId === BLOCK_IDS.Path) {
    return SURFACE_TEXTURE_KINDS.PathDirt;
  }

  if (blockId === BLOCK_IDS.Dirt) return SURFACE_TEXTURE_KINDS.Dirt;
  if (blockId === BLOCK_IDS.PathDirt) return SURFACE_TEXTURE_KINDS.PathDirt;
  if (blockId === BLOCK_IDS.Stone) return SURFACE_TEXTURE_KINDS.Stone;
  if (blockId === BLOCK_IDS.MossyStone) return SURFACE_TEXTURE_KINDS.MossyStone;
  if (blockId === BLOCK_IDS.WoodPlanks) return SURFACE_TEXTURE_KINDS.WoodPlanks;
  if (blockId === BLOCK_IDS.Sand) return SURFACE_TEXTURE_KINDS.Sand;
  if (blockId === BLOCK_IDS.Riverbed) return SURFACE_TEXTURE_KINDS.Riverbed;

  return SURFACE_TEXTURE_KINDS.None;
}

function getTextureVariation(x: number, y: number, z: number, textureKind: number) {
  if (textureKind === SURFACE_TEXTURE_KINDS.None) {
    return { variant: 0, rotation: 0, mirror: 0 };
  }

  const hash = hashCoordinates(x, y, z, textureKind);
  const variantCount = (
    textureKind === SURFACE_TEXTURE_KINDS.GrassSide ||
    textureKind === SURFACE_TEXTURE_KINDS.MossyStone ||
    textureKind === SURFACE_TEXTURE_KINDS.WoodPlanks
  ) ? 3 : 4;
  return {
    variant: hash % variantCount,
    rotation: (
      textureKind === SURFACE_TEXTURE_KINDS.GrassSide || textureKind === SURFACE_TEXTURE_KINDS.WoodPlanks
    ) ? 0 : (hash >>> 3) % 4,
    mirror: (hash >>> 5) % 2,
  };
}

function hashCoordinates(x: number, y: number, z: number, salt: number) {
  return (
    Math.imul(x + 1, 73_856_093) ^
    Math.imul(y + 1, 19_349_663) ^
    Math.imul(z + 1, 83_492_791) ^
    Math.imul(salt + 1, 2_654_435_761)
  ) >>> 0;
}

function isCellTopFullyCovered(world: VoxelWorld, x: number, y: number, z: number) {
  const aboveY = y + 1;
  if (!world.isInsideWorld(x, aboveY, z)) return false;

  const aboveBlock = getBlockDefinition(world.getBlock(x, aboveY, z));
  if (!aboveBlock.renderable || !aboveBlock.solid) return false;

  const aboveShape = getCachedShape(world.getShape(x, aboveY, z), world.getRotation(x, aboveY, z), world.getState(x, aboveY, z));
  return aboveShape.occluder && aboveShape.fullFaces.has("ny");
}

export function buildSurfaceChunkMeshes(world: VoxelWorld) {
  const startedAt = now();
  const chunks: SurfaceChunkMeshData[] = [];
  const chunkCounts = getChunkCounts(world.config);

  for (let chunkZ = 0; chunkZ < chunkCounts.z; chunkZ += 1) {
    for (let chunkX = 0; chunkX < chunkCounts.x; chunkX += 1) {
      chunks.push(buildSurfaceChunkMesh(world, chunkX, chunkZ));
    }
  }

  return {
    chunks,
    totalBuildMs: Number((now() - startedAt).toFixed(3)),
  };
}

function occludesFace(world: VoxelWorld, x: number, y: number, z: number, face: ShapeFace) {
  if (face.occlusion !== "full") return false;
  // Direct array reads: this runs six times for every solid cell of a chunk.
  const { width, depth, minY, height } = world.config;
  if (x < 0 || x >= width || z < 0 || z >= depth || y < minY || y >= minY + height) return false;
  const index = x + width * (z + depth * (y - minY));
  if (OCCLUDING_BLOCK[world.blocks[index]] === 0) return false;

  const neighbourShape = getCachedShape(world.shapes[index], world.rotations[index], world.states[index]);
  return neighbourShape.occluder && neighbourShape.fullFaces.has(OPPOSITE[face.direction]);
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
