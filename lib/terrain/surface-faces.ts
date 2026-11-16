import { BLOCK_IDS, getBlockDefinition } from "@/lib/world/block-registry";
import { revealDelayAt } from "@/lib/world/reveal";
import type { WorldConfig } from "@/lib/world/world-config";
import { getShapeDefinition, type FaceDirection, type ShapeFace } from "@/lib/voxel-shapes/shape-registry";

/**
 * Turning visible cell faces into the vertex data the terrain material reads.
 *
 * Meshing is two steps: deciding which faces of which cells are visible
 * (that needs the voxel world and its neighbours), and writing those faces
 * out. This module is the second step, shared by the live mesher and by the
 * baked world, which stores only the first step's result. Both therefore
 * produce the same bytes for the same faces.
 *
 * No voxel world here: a face is fully described by its cell, the cell's
 * block, shape, rotation and state, two flags, and the face's index in the
 * shape's face list.
 */
export type SurfaceCell = {
  x: number;
  y: number;
  z: number;
  blockId: number;
  shapeId: number;
  rotation: number;
  state: number;
  /** Bit 0: the cell is the loader platform. Bit 1: a ground cell whose top is covered (dirt instead of grass). */
  flags: number;
  /** Indices into the shape's face list, of the faces that are drawn. */
  faces: number[];
};

export const CELL_LOADER_PLATFORM = 1;
export const CELL_GRASS_COVERED = 2;

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

/** Faces are drawn 1 % larger than the cell, so neighbouring shapes never leave a hairline gap. */
export const SURFACE_BLOCK_SIZE = 1.01;

const shapeFaceCache = new Map<number, ShapeFace[]>();

/** A shape's faces for one rotation and state, built once. */
export function getShapeFaces(shapeId: number, rawRotation: number, state: number): ShapeFace[] {
  const rotation = rawRotation > 3 ? 0 : rawRotation;
  const key = (shapeId << 12) | (rotation << 8) | state;
  let faces = shapeFaceCache.get(key);
  if (!faces) {
    const shape = getShapeDefinition(shapeId);
    faces = shape.faces(rotation as Parameters<typeof shape.faces>[0], state);
    shapeFaceCache.set(key, faces);
  }
  return faces;
}

const blockColorCache = new Map<number, [number, number, number]>();

export function getBlockColor(blockId: number) {
  let color = blockColorCache.get(blockId);
  if (!color) {
    const value = Number.parseInt(getBlockDefinition(blockId).developmentColor.replace("#", ""), 16);
    color = [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
    blockColorCache.set(blockId, color);
  }
  return color;
}

const faceUvCache = new WeakMap<ShapeFace, Array<[number, number]>>();

export function getFaceUvs(face: ShapeFace) {
  let uvs = faceUvCache.get(face);
  if (!uvs) {
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
    uvs = projected.map(([u, v]) => [(u - minU) / width, (v - minV) / height]);
    faceUvCache.set(face, uvs);
  }
  return uvs;
}

export function getSurfaceTextureKind(blockId: number, direction: FaceDirection, grassTopCovered: boolean) {
  if (blockId === BLOCK_IDS.Ground) {
    if (grassTopCovered) return SURFACE_TEXTURE_KINDS.Dirt;
    if (direction === "py") return SURFACE_TEXTURE_KINDS.GrassTop;
    if (direction === "ny") return SURFACE_TEXTURE_KINDS.Dirt;
    return SURFACE_TEXTURE_KINDS.GrassSide;
  }
  if (blockId === BLOCK_IDS.Path) return SURFACE_TEXTURE_KINDS.PathDirt;
  if (blockId === BLOCK_IDS.Dirt) return SURFACE_TEXTURE_KINDS.Dirt;
  if (blockId === BLOCK_IDS.PathDirt) return SURFACE_TEXTURE_KINDS.PathDirt;
  if (blockId === BLOCK_IDS.Stone) return SURFACE_TEXTURE_KINDS.Stone;
  if (blockId === BLOCK_IDS.MossyStone) return SURFACE_TEXTURE_KINDS.MossyStone;
  if (blockId === BLOCK_IDS.WoodPlanks) return SURFACE_TEXTURE_KINDS.WoodPlanks;
  if (blockId === BLOCK_IDS.Sand) return SURFACE_TEXTURE_KINDS.Sand;
  if (blockId === BLOCK_IDS.Riverbed) return SURFACE_TEXTURE_KINDS.Riverbed;
  return SURFACE_TEXTURE_KINDS.None;
}

export function getTextureVariation(x: number, y: number, z: number, textureKind: number) {
  if (textureKind === SURFACE_TEXTURE_KINDS.None) return { variant: 0, rotation: 0, mirror: 0 };
  const hash = (
    Math.imul(x + 1, 73_856_093) ^
    Math.imul(y + 1, 19_349_663) ^
    Math.imul(z + 1, 83_492_791) ^
    Math.imul(textureKind + 1, 2_654_435_761)
  ) >>> 0;
  const variantCount = (
    textureKind === SURFACE_TEXTURE_KINDS.GrassSide ||
    textureKind === SURFACE_TEXTURE_KINDS.MossyStone ||
    textureKind === SURFACE_TEXTURE_KINDS.WoodPlanks
  ) ? 3 : 4;
  return {
    variant: hash % variantCount,
    rotation: (textureKind === SURFACE_TEXTURE_KINDS.GrassSide || textureKind === SURFACE_TEXTURE_KINDS.WoodPlanks) ? 0 : (hash >>> 3) % 4,
    mirror: (hash >>> 5) % 2,
  };
}

/**
 * Collects the vertex data of faces, in the order they are emitted, in the
 * layout the terrain material reads. `finish` hands back typed arrays.
 */
export class SurfaceEmitter {
  private readonly config: Pick<WorldConfig, "width" | "depth" | "blockSize">;
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly uvs: number[] = [];
  readonly tex: number[] = [];
  readonly reveal: number[] = [];
  readonly indices: number[] = [];
  /** Per drawn face: the cell index and direction, for tools that pick against the mesh. Filled only when asked for. */
  readonly mappings: Array<{ cellIndex: number; direction: FaceDirection }> | null;
  faceCount = 0;

  constructor(config: Pick<WorldConfig, "width" | "depth" | "blockSize">, withMappings = false) {
    this.config = config;
    this.mappings = withMappings ? [] : null;
  }

  /** Writes the listed faces of one cell. `cellIndex` is only used for mappings. */
  emit(cell: SurfaceCell, cellIndex = -1) {
    const { x, y, z, blockId } = cell;
    const { width, depth, blockSize } = this.config;
    const shapeFaces = getShapeFaces(cell.shapeId, cell.rotation, cell.state);
    const loader = (cell.flags & CELL_LOADER_PLATFORM) !== 0;
    const covered = (cell.flags & CELL_GRASS_COVERED) !== 0;
    const cx = (x - (width - 1) / 2) * blockSize;
    const cy = (y + 0.5) * blockSize;
    const cz = (z - (depth - 1) / 2) * blockSize;
    const color = getBlockColor(loader ? BLOCK_IDS.LoaderOrigin : blockId);
    const variationByte = Math.round((((x * 37 + z * 17 + y * 11) % 100) / 100) * 255);
    const delay = loader ? -1 : revealDelayAt(this.config, x, z);

    for (const faceIndex of cell.faces) {
      const face = shapeFaces[faceIndex];
      const vertexOffset = this.positions.length / 3;
      const [nx, ny, nz] = face.normal;
      const textureKind = loader ? SURFACE_TEXTURE_KINDS.None : getSurfaceTextureKind(blockId, face.direction, covered);
      const variation = getTextureVariation(x, y, z, textureKind);
      const turn = variation.rotation + (variation.mirror > 0 ? 4 : 0);
      const faceUvs = getFaceUvs(face);
      for (let corner = 0; corner < face.corners.length; corner += 1) {
        const point = face.corners[corner];
        this.positions.push(cx + point[0] * SURFACE_BLOCK_SIZE, cy + point[1] * SURFACE_BLOCK_SIZE, cz + point[2] * SURFACE_BLOCK_SIZE);
        this.normals.push(nx, ny, nz);
        this.colors.push(color[0], color[1], color[2]);
        this.uvs.push(faceUvs[corner][0], faceUvs[corner][1]);
        this.tex.push(textureKind, variation.variant, turn, variationByte);
        this.reveal.push(cx, cy, cz, delay);
      }
      this.indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
      this.mappings?.push({ cellIndex, direction: face.direction });
      this.faceCount += 1;
    }
  }
}
