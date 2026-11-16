import { BLOCK_IDS } from "./block-registry";
import type { VoxelWorld } from "./voxel-world";
import { getWorldMaxY, type GridCoordinate, type WorldPosition } from "./world-config";

export type VoxelRayHit = {
  cell: GridCoordinate;
  /** Distance along the ray, in world units. */
  distance: number;
  /** Unit normal of the face the ray entered through; zero when the ray started inside the cell. */
  normal: GridCoordinate;
  point: WorldPosition;
};

/**
 * First non-air cell along a ray, found by stepping cell to cell (Amanatides &
 * Woo). Cost is proportional to the number of cells crossed, independent of
 * world size, and needs no render geometry: it works the same for the voxel
 * view and for mini-game zones.
 *
 * Shapes are treated as full cells, which is exact enough for hover and zone
 * picking.
 */
export function raycastVoxels(
  world: VoxelWorld,
  origin: WorldPosition,
  direction: WorldPosition,
  maxDistance = 400,
): VoxelRayHit | null {
  const { width, depth, minY, blockSize } = world.config;
  const maxY = getWorldMaxY(world.config);
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length === 0) return null;
  const dx = direction.x / length;
  const dy = direction.y / length;
  const dz = direction.z / length;

  // Continuous grid space: cell (x, y, z) spans [x, x+1) on each axis.
  let px = origin.x / blockSize + width / 2;
  let py = origin.y / blockSize;
  let pz = origin.z / blockSize + depth / 2;

  // Advance to the world's bounding box if the ray starts outside it.
  let travelled = 0;
  const enter = entryDistance(px, py, pz, dx, dy, dz, 0, minY, 0, width, maxY + 1, depth);
  if (enter === null) return null;
  if (enter > 0) {
    travelled = enter + 1e-4;
    px += dx * travelled;
    py += dy * travelled;
    pz += dz * travelled;
  }

  let x = Math.floor(px);
  let y = Math.floor(py);
  let z = Math.floor(pz);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const deltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const deltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const deltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let nextX = dx !== 0 ? ((dx > 0 ? x + 1 - px : px - x) * deltaX) : Infinity;
  let nextY = dy !== 0 ? ((dy > 0 ? y + 1 - py : py - y) * deltaY) : Infinity;
  let nextZ = dz !== 0 ? ((dz > 0 ? z + 1 - pz : pz - z) * deltaZ) : Infinity;
  const limit = maxDistance / blockSize;
  let local = 0;
  const normal = { x: 0, y: 0, z: 0 };

  while (travelled + local <= limit) {
    if (x < 0 || x >= width || z < 0 || z >= depth || y < minY || y > maxY) return null;
    if (world.getBlock(x, y, z) !== BLOCK_IDS.Air) {
      const distance = (travelled + local) * blockSize;
      return {
        cell: { x, y, z },
        distance,
        normal: { ...normal },
        point: { x: origin.x + dx * distance, y: origin.y + dy * distance, z: origin.z + dz * distance },
      };
    }
    if (nextX <= nextY && nextX <= nextZ) {
      local = nextX;
      nextX += deltaX;
      x += stepX;
      normal.x = -stepX;
      normal.y = 0;
      normal.z = 0;
    } else if (nextY <= nextZ) {
      local = nextY;
      nextY += deltaY;
      y += stepY;
      normal.x = 0;
      normal.y = -stepY;
      normal.z = 0;
    } else {
      local = nextZ;
      nextZ += deltaZ;
      z += stepZ;
      normal.x = 0;
      normal.y = 0;
      normal.z = -stepZ;
    }
  }
  return null;
}

/** Distance at which a ray enters an axis-aligned box; 0 if it starts inside; null if it misses. */
function entryDistance(
  px: number, py: number, pz: number,
  dx: number, dy: number, dz: number,
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
): number | null {
  let near = 0;
  let far = Infinity;
  const axes: Array<[number, number, number, number]> = [[px, dx, minX, maxX], [py, dy, minY, maxY], [pz, dz, minZ, maxZ]];
  for (const [position, direction, min, max] of axes) {
    if (direction === 0) {
      if (position < min || position >= max) return null;
      continue;
    }
    const a = (min - position) / direction;
    const b = (max - position) / direction;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return near;
}
