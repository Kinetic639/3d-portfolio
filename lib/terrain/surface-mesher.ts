import { BLOCK_IDS, getBlockDefinition } from "@/lib/world/block-registry";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import { getChunkCounts, getWorldMaxY, type GridCoordinate, type WorldPosition } from "@/lib/world/world-config";
import { computeExpansionDelay, isLoaderPlatformTopCell } from "@/lib/world/reveal";
import { FACE_NEIGHBOUR_OFFSETS, getShapeDefinition, type FaceDirection, type ShapeFace } from "@/lib/voxel-shapes/shape-registry";
import {
  CELL_GRASS_COVERED,
  CELL_LOADER_PLATFORM,
  getBlockColor,
  getFaceUvs,
  getSurfaceTextureKind,
  getTextureVariation,
  SURFACE_BLOCK_SIZE,
  SURFACE_TEXTURE_KINDS,
  SurfaceEmitter,
  type SurfaceCell,
} from "./surface-faces";

export { SURFACE_TEXTURE_KINDS } from "./surface-faces";

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
  /**
   * Present with the `packed` option. Per vertex, `tex`: texture kind,
   * variant, rotation (0-3) plus 4 when mirrored, variation x 255; `reveal`:
   * the cell's centre and its reveal delay, negative for the loader platform.
   */
  packed?: { tex: Uint8Array; reveal: Float32Array };
};

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

export type SurfaceMeshOptions = {
  /**
   * Only positions, normals, colours and indices are filled; every other
   * array is left empty. That is all the renderer draws today, and skipping
   * the rest roughly halves the cost of a chunk rebuild.
   */
  renderOnly?: boolean;
  /** Leaves out the face-to-cell mappings (`faceMappings`, `triangleToCell`), which only picking against the mesh needs. */
  skipMappings?: boolean;
  /**
   * Writes the texture and reveal parameters straight into the two packed
   * vectors the terrain material reads (`packed`), instead of eight separate
   * arrays. Used by everything that renders; the separate arrays stay empty.
   */
  packed?: boolean;
};

/**
 * The visible faces of the cells in a rectangle of columns: which cells, and
 * which of each cell's shape faces, are drawn. A face is hidden when a solid
 * neighbour covers it fully, or when it is the underside of the world's
 * lowest layer, which no camera can see. The loader platform keeps every
 * face, so it stands complete during the entry wave.
 *
 * `include` limits which columns are collected; neighbours outside it still
 * hide faces, so a part of the world meshes exactly as it would whole.
 */
export function collectSurfaceCells(
  world: VoxelWorld,
  region: { minX: number; maxX: number; minZ: number; maxZ: number },
  include?: (x: number, z: number) => boolean,
): SurfaceCell[] {
  const cells: SurfaceCell[] = [];
  const { width, depth, minY } = world.config;
  const maxY = getWorldMaxY(world.config);
  const centreMinX = width / 2 - 1;
  const centreMinZ = depth / 2 - 1;
  for (let y = minY; y <= maxY; y += 1) {
    for (let z = region.minZ; z <= region.maxZ; z += 1) {
      const rowIndex = width * (z + depth * (y - minY));
      for (let x = region.minX; x <= region.maxX; x += 1) {
        const cellIndex = rowIndex + x;
        const blockId = world.blocks[cellIndex];
        if (RENDERABLE_BLOCK[blockId] === 0) continue;
        if (include && !include(x, z)) continue;
        const shapeId = world.shapes[cellIndex];
        const rotation = world.rotations[cellIndex];
        const state = world.states[cellIndex];
        const shapeFaces = getCachedShape(shapeId, rotation, state).faces;
        const loader = x >= centreMinX && x <= centreMinX + 1 && z >= centreMinZ && z <= centreMinZ + 1 && isLoaderPlatformTopCell(world, x, y, z);
        let faces: number[] | null = null;
        for (let faceIndex = 0; faceIndex < shapeFaces.length; faceIndex += 1) {
          const face = shapeFaces[faceIndex];
          if (y === minY && face.direction === "ny") continue;
          const [dx, dy, dz] = FACE_NEIGHBOUR_OFFSETS[face.direction];
          if (!loader && occludesFace(world, x + dx, y + dy, z + dz, face)) continue;
          (faces ??= []).push(faceIndex);
        }
        if (!faces) continue;
        const covered = blockId === BLOCK_IDS.Ground && isCellTopFullyCovered(world, x, y, z);
        cells.push({ x, y, z, blockId, shapeId, rotation, state, flags: (loader ? CELL_LOADER_PLATFORM : 0) | (covered ? CELL_GRASS_COVERED : 0), faces });
      }
    }
  }
  return cells;
}

export function buildSurfaceChunkMesh(world: VoxelWorld, chunkX: number, chunkZ: number, options: SurfaceMeshOptions = {}): SurfaceChunkMeshData {
  if (options.packed) return buildPackedChunk(world, chunkX, chunkZ, options);
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
          // The underside of the world's lowest layer: no camera ever goes below the ground.
          if (y === minY && face.direction === "ny") continue;

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
            if (!options.skipMappings) {
              faceMappings.push({ cellIndex, direction: face.direction });
              triangleCells.push(cellIndex, cellIndex);
            }
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

/** The packed path: visible faces through the shared emitter, as the baked world decodes them. */
function buildPackedChunk(world: VoxelWorld, chunkX: number, chunkZ: number, options: SurfaceMeshOptions): SurfaceChunkMeshData {
  const startedAt = now();
  const { chunkSize, width, depth, minY } = world.config;
  const minGridX = chunkX * chunkSize;
  const minGridZ = chunkZ * chunkSize;
  const maxGridX = minGridX + chunkSize - 1;
  const maxGridZ = minGridZ + chunkSize - 1;
  const emitter = new SurfaceEmitter(world.config, !options.skipMappings);
  for (const cell of collectSurfaceCells(world, { minX: minGridX, maxX: maxGridX, minZ: minGridZ, maxZ: maxGridZ })) {
    emitter.emit(cell, cell.x + width * (cell.z + depth * (cell.y - minY)));
  }
  const empty = new Float32Array(0);
  const triangleCells = emitter.mappings ? emitter.mappings.flatMap((mapping) => [mapping.cellIndex, mapping.cellIndex]) : [];
  return {
    id: world.getChunkId(chunkX, chunkZ),
    chunkX,
    chunkZ,
    positions: new Float32Array(emitter.positions),
    normals: new Float32Array(emitter.normals),
    uvs: new Float32Array(emitter.uvs),
    textureKinds: empty,
    textureVariants: empty,
    uvRotations: empty,
    uvMirrors: empty,
    colors: new Float32Array(emitter.colors),
    variations: empty,
    revealDelays: empty,
    cellOrigins: empty,
    centerFlags: empty,
    indices: new Uint32Array(emitter.indices),
    faceMappings: emitter.mappings ?? [],
    triangleToCell: new Uint32Array(triangleCells),
    visibleQuads: emitter.faceCount,
    triangles: emitter.faceCount * 2,
    bounds: { min: { x: minGridX, y: minY, z: minGridZ }, max: { x: maxGridX, y: getWorldMaxY(world.config), z: maxGridZ } },
    boundingBox: {
      min: world.gridToWorld(minGridX, minY, minGridZ),
      max: world.gridToWorld(maxGridX, getWorldMaxY(world.config), maxGridZ),
    },
    buildMs: Number((now() - startedAt).toFixed(3)),
    packed: { tex: new Uint8Array(emitter.tex), reveal: new Float32Array(emitter.reveal) },
  };
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

function now() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
