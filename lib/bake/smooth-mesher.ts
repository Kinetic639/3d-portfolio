import { getShapeDefinition } from "@/lib/voxel-shapes/shape-registry";
import { BLOCK_IDS, getBlockDefinition } from "@/lib/world/block-registry";
import type { VoxelWorld } from "@/lib/world/voxel-world";

/**
 * Turns voxels into a smooth surface.
 *
 * 1. `buildDensityVolume`: one density sample per cell (1 solid, 0 air, the
 *    filled fraction for partial shapes), with a margin around the region.
 * 2. `blurDensity`: a small separable blur. This is what removes the
 *    staircase: a one-block step becomes a slope, a flat top stays exactly
 *    where it was.
 * 3. `extractSurface`: Surface Nets. One vertex per grid cube the surface
 *    passes through, placed at the mean of the edge crossings, joined into
 *    quads.
 *
 * Everything depends only on the density near a point, so two meshes built
 * from overlapping parts of the same world agree exactly where they meet.
 * The bake relies on that to cut the world into regions, and mini-game zones
 * rely on it to re-mesh a small part of the world at runtime and still fit
 * the baked terrain around them.
 *
 * No three.js and no DOM: runs in Node (bake), in a worker (editor preview)
 * and on the main thread (mini-game zones).
 */
export type GridRegion = { minX: number; maxX: number; minZ: number; maxZ: number };

export type DensityVolume = {
  nx: number;
  ny: number;
  nz: number;
  /** Sample (i, j, k) is cell (cellX + i, cellY + j, cellZ + k). Index: i + nx * (k + nz * j). */
  cellX: number;
  cellY: number;
  cellZ: number;
  density: Float32Array;
  /** Block id of the cell before blurring; 0 for air. */
  material: Uint16Array;
  /** World-space position of the centre of cell (0, 0, 0), and the cell size. */
  worldOrigin: { x: number; y: number; z: number };
  cellSize: number;
  /** The world's own extent in cells, for telling real cells from margin. */
  worldWidth: number;
  worldDepth: number;
};

export type SmoothSurface = {
  /** World space, 3 per vertex. */
  positions: Float32Array;
  normals: Float32Array;
  /** Linear RGB, 3 per vertex. */
  colors: Float32Array;
  indices: Uint32Array;
  /** Per triangle: the column of the solid cell the triangle belongs to. */
  triangleColumnX: Int16Array;
  triangleColumnZ: Int16Array;
};

export const SURFACE_MARGIN = 3;
const ISO = 0.5;

const srgbToLinear = (value: number) => (value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
const linearColorCache = new Map<number, [number, number, number]>();

function blockColor(blockId: number): [number, number, number] {
  let color = linearColorCache.get(blockId);
  if (!color) {
    const value = Number.parseInt(getBlockDefinition(blockId).developmentColor.replace("#", ""), 16);
    color = [srgbToLinear(((value >> 16) & 255) / 255), srgbToLinear(((value >> 8) & 255) / 255), srgbToLinear((value & 255) / 255)];
    linearColorCache.set(blockId, color);
  }
  return color;
}

const fillCache = new Map<number, number>();

/** How much of its cell a shape fills, from its bounding box. Cubes are 1. */
function shapeFill(shapeId: number, rotation: number, state: number) {
  if (shapeId === 0) return 1;
  const key = (shapeId << 12) | (rotation << 8) | state;
  let fill = fillCache.get(key);
  if (fill === undefined) {
    const shape = getShapeDefinition(shapeId);
    const bounds = shape.bounds((rotation > 3 ? 0 : rotation) as Parameters<typeof shape.bounds>[0], state);
    const volume = (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY) * (bounds.maxZ - bounds.minZ);
    // Never below the surface threshold on its own, so small props leave a bump rather than nothing.
    // In steps of 1/255, so a stored byte reproduces it exactly (see the baked voxel zones).
    fill = Math.round(Math.min(1, Math.max(0.55, volume)) * 255) / 255;
    fillCache.set(key, fill);
  }
  return fill;
}

/**
 * Samples the world's cells in `region` plus a margin. Outside the world the
 * terrain is continued: columns repeat the nearest edge column and everything
 * below the world is solid, so the surface has no walls or floor at the edges.
 */
export function buildDensityVolume(world: VoxelWorld, region: GridRegion, margin = SURFACE_MARGIN): DensityVolume {
  const { width, depth, minY, height, blockSize } = world.config;
  const cellX = region.minX - margin;
  const cellZ = region.minZ - margin;
  const cellY = minY - 1;
  const nx = region.maxX - region.minX + 1 + margin * 2;
  const nz = region.maxZ - region.minZ + 1 + margin * 2;
  const ny = height + 3;
  const density = new Float32Array(nx * ny * nz);
  const material = new Uint16Array(nx * ny * nz);

  for (let k = 0; k < nz; k += 1) {
    const z = Math.min(depth - 1, Math.max(0, cellZ + k));
    for (let i = 0; i < nx; i += 1) {
      const x = Math.min(width - 1, Math.max(0, cellX + i));
      // Below the world: solid.
      density[i + nx * k] = 1;
      material[i + nx * k] = BLOCK_IDS.Stone;
      for (let j = 1; j <= height; j += 1) {
        const source = x + width * (z + depth * (j - 1));
        const blockId = world.blocks[source];
        if (blockId === BLOCK_IDS.Air || !getBlockDefinition(blockId).renderable) continue;
        const target = i + nx * (k + nz * j);
        density[target] = shapeFill(world.shapes[source], world.rotations[source], world.states[source]);
        material[target] = blockId;
      }
    }
  }

  const origin = world.gridToWorld(0, 0, 0);
  return { nx, ny, nz, cellX, cellY, cellZ, density, material, worldOrigin: origin, cellSize: blockSize, worldWidth: width, worldDepth: depth };
}

/** Separable [1, 2, 1] / 4 blur, `iterations` times. Edges repeat the border sample. */
export function blurDensity(volume: DensityVolume, iterations = 1) {
  const { nx, ny, nz } = volume;
  let source: Float32Array = volume.density;
  let target: Float32Array = new Float32Array(source.length);
  const pass = (stride: number, count: number, lineStarts: (visit: (start: number) => void) => void) => {
    lineStarts((start) => {
      for (let n = 0; n < count; n += 1) {
        const at = start + n * stride;
        const before = n > 0 ? source[at - stride] : source[at];
        const after = n < count - 1 ? source[at + stride] : source[at];
        target[at] = (before + 2 * source[at] + after) * 0.25;
      }
    });
    [source, target] = [target, source];
  };

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    pass(1, nx, (visit) => {
      for (let line = 0; line < ny * nz; line += 1) visit(line * nx);
    });
    pass(nx, nz, (visit) => {
      for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) visit(i + nx * nz * j);
    });
    pass(nx * nz, ny, (visit) => {
      for (let k = 0; k < nz; k += 1) for (let i = 0; i < nx; i += 1) visit(i + nx * k);
    });
  }
  volume.density = source;
  return volume;
}

// Cube corner offsets (di, dj, dk) and the 12 edges as corner index pairs.
const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/**
 * Surface Nets over a (blurred) density volume. Only triangles that belong
 * to real world cells inside `region` are emitted; the margin exists so that
 * those triangles see the same neighbourhood as in any other region.
 */
export function extractSurface(volume: DensityVolume, region: GridRegion): SmoothSurface {
  const { nx, ny, nz, density, material, cellX, cellY, cellZ, cellSize, worldOrigin } = volume;
  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  const strideJ = nx * nz;
  const vertexOfCube = new Int32Array(cx * cy * cz).fill(-1);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const corner = new Float32Array(8);

  const sample = (x: number, y: number, z: number) => {
    // Trilinear, clamped to the volume.
    const fx = Math.min(nx - 1.001, Math.max(0, x));
    const fy = Math.min(ny - 1.001, Math.max(0, y));
    const fz = Math.min(nz - 1.001, Math.max(0, z));
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const k = Math.floor(fz);
    const tx = fx - i;
    const ty = fy - j;
    const tz = fz - k;
    const at = i + nx * (k + nz * j);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const low = lerp(lerp(density[at], density[at + 1], tx), lerp(density[at + nx], density[at + nx + 1], tx), tz);
    const high = lerp(lerp(density[at + strideJ], density[at + strideJ + 1], tx), lerp(density[at + strideJ + nx], density[at + strideJ + nx + 1], tx), tz);
    return lerp(low, high, ty);
  };

  for (let j = 0; j < cy; j += 1) {
    for (let k = 0; k < cz; k += 1) {
      for (let i = 0; i < cx; i += 1) {
        const base = i + nx * (k + nz * j);
        let mask = 0;
        for (let c = 0; c < 8; c += 1) {
          const value = density[base + CORNERS[c][0] + nx * CORNERS[c][2] + strideJ * CORNERS[c][1]];
          corner[c] = value;
          if (value >= ISO) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;

        let px = 0;
        let py = 0;
        let pz = 0;
        let crossings = 0;
        for (const [a, b] of EDGES) {
          if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
          const t = (ISO - corner[a]) / (corner[b] - corner[a]);
          px += CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * t;
          py += CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * t;
          pz += CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * t;
          crossings += 1;
        }
        const sx = i + px / crossings;
        const sy = j + py / crossings;
        const sz = k + pz / crossings;

        vertexOfCube[i + cx * (k + cz * j)] = positions.length / 3;
        positions.push(
          worldOrigin.x + (cellX + sx) * cellSize,
          worldOrigin.y + (cellY + sy) * cellSize,
          worldOrigin.z + (cellZ + sz) * cellSize,
        );

        // The surface normal points from solid to air: against the density gradient.
        const gx = sample(sx - 0.5, sy, sz) - sample(sx + 0.5, sy, sz);
        const gy = sample(sx, sy - 0.5, sz) - sample(sx, sy + 0.5, sz);
        const gz = sample(sx, sy, sz - 0.5) - sample(sx, sy, sz + 0.5);
        const length = Math.hypot(gx, gy, gz) || 1;
        normals.push(gx / length, gy / length, gz / length);

        // Colour of the highest solid cell touching the vertex: what lies on top is what shows.
        let blockId = 0;
        let bestRank = -1;
        for (let c = 0; c < 8; c += 1) {
          const id = material[base + CORNERS[c][0] + nx * CORNERS[c][2] + strideJ * CORNERS[c][1]];
          if (id === 0) continue;
          const rank = CORNERS[c][1] * 2 + corner[c];
          if (rank > bestRank) {
            bestRank = rank;
            blockId = id;
          }
        }
        if (blockId === 0) {
          // Blur can carry the surface into cells that were all air; take the first solid cell below.
          for (let below = j; below >= 0 && blockId === 0; below -= 1) blockId = material[i + nx * (k + nz * below)];
        }
        const color = blockColor(blockId || BLOCK_IDS.Stone);
        colors.push(color[0], color[1], color[2]);
      }
    }
  }

  const indices: number[] = [];
  const columnX: number[] = [];
  const columnZ: number[] = [];
  const cube = (i: number, j: number, k: number) => vertexOfCube[i + cx * (k + cz * j)];
  const emit = (a: number, b: number, c: number, d: number, flip: boolean, ownerI: number, ownerK: number) => {
    const x = cellX + ownerI;
    const z = cellZ + ownerK;
    if (x < region.minX || x > region.maxX || z < region.minZ || z > region.maxZ) return;
    if (x < 0 || x >= volume.worldWidth || z < 0 || z >= volume.worldDepth) return;
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, d, c, a, c, b);
    else indices.push(a, b, c, a, c, d);
    columnX.push(x, x);
    columnZ.push(z, z);
  };

  // Every grid edge whose ends are on opposite sides of the surface joins the four cubes around it.
  for (let j = 1; j < cy; j += 1) {
    for (let k = 1; k < cz; k += 1) {
      for (let i = 1; i < cx; i += 1) {
        const at = i + nx * (k + nz * j);
        const inside = density[at] >= ISO;
        if (inside !== density[at + 1] >= ISO) {
          emit(cube(i, j - 1, k - 1), cube(i, j, k - 1), cube(i, j, k), cube(i, j - 1, k), !inside, inside ? i : i + 1, k);
        }
        if (inside !== density[at + strideJ] >= ISO) {
          emit(cube(i - 1, j, k - 1), cube(i - 1, j, k), cube(i, j, k), cube(i, j, k - 1), !inside, i, k);
        }
        if (inside !== density[at + nx] >= ISO) {
          emit(cube(i - 1, j - 1, k), cube(i, j - 1, k), cube(i, j, k), cube(i - 1, j, k), !inside, i, inside ? k : k + 1);
        }
      }
    }
  }

  // Vertices in the margin belong to no emitted triangle; drop them.
  return filterSurface({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
    triangleColumnX: new Int16Array(columnX),
    triangleColumnZ: new Int16Array(columnZ),
  }, () => true);
}

/** The three steps in one call. */
export function buildSmoothSurface(world: VoxelWorld, region: GridRegion, options: { blur?: number } = {}): SmoothSurface {
  return extractSurface(blurDensity(buildDensityVolume(world, region), options.blur ?? 1), region);
}

/** Keeps the triangles `keep` accepts and drops vertices nothing uses any more. */
export function filterSurface(surface: SmoothSurface, keep: (columnX: number, columnZ: number) => boolean): SmoothSurface {
  const remap = new Int32Array(surface.positions.length / 3).fill(-1);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const columnX: number[] = [];
  const columnZ: number[] = [];
  for (let triangle = 0; triangle < surface.indices.length / 3; triangle += 1) {
    if (!keep(surface.triangleColumnX[triangle], surface.triangleColumnZ[triangle])) continue;
    for (let n = 0; n < 3; n += 1) {
      const vertex = surface.indices[triangle * 3 + n];
      if (remap[vertex] === -1) {
        remap[vertex] = positions.length / 3;
        for (let axis = 0; axis < 3; axis += 1) {
          positions.push(surface.positions[vertex * 3 + axis]);
          normals.push(surface.normals[vertex * 3 + axis]);
          colors.push(surface.colors[vertex * 3 + axis]);
        }
      }
      indices.push(remap[vertex]);
    }
    columnX.push(surface.triangleColumnX[triangle]);
    columnZ.push(surface.triangleColumnZ[triangle]);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
    triangleColumnX: new Int16Array(columnX),
    triangleColumnZ: new Int16Array(columnZ),
  };
}
