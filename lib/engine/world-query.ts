import { getTerrainSurfaceAtWorldPosition } from "@/lib/world/surface-query";
import { raycastVoxels } from "@/lib/world/voxel-raycast";
import type { VoxelWorld } from "@/lib/world/voxel-world";

/**
 * What the runtime asks about terrain, independent of how the terrain is
 * stored: a voxel world (unbaked maps, the editor) or the height and zone
 * grids of a baked world.
 */
export type Vec3Like = { x: number; y: number; z: number };

export type TerrainHit = {
  /** Distance along the ray, world units. */
  distance: number;
  /** Column that was hit. */
  x: number;
  z: number;
};

export type WorldQuery = {
  width: number;
  depth: number;
  /** First terrain the ray meets, or null. `direction` must be normalised. */
  raycast: (origin: Vec3Like, direction: Vec3Like) => TerrainHit | null;
  /** World-space height of the ground in a column; 0 where there is none. */
  surfaceHeight: (x: number, z: number) => number;
  /**
   * Where a creature stands at a world position: the height of the surface it can stand on, with partial
   * shapes counted as what they are (a slab is half a block, stairs and slopes their own height) and
   * shapes nothing stands on skipped (a curb's thin lip: the ground under it). surfaceHeight, by contrast,
   * is the top of the highest occupied cell of a column, which is right for picking and labels.
   */
  groundAt: (x: number, z: number) => number;
  /** Numeric zone id of a column; 0 for none or outside the map. */
  columnZone: (x: number, z: number) => number;
  /** World position of the centre of a cell. */
  cellToWorld: (x: number, y: number, z: number) => Vec3Like;
};

const cellToWorld = (width: number, depth: number) => (x: number, y: number, z: number) => ({
  x: x - (width - 1) / 2,
  y: y + 0.5,
  z: z - (depth - 1) / 2,
});

export function createVoxelWorldQuery(world: VoxelWorld): WorldQuery {
  const { width, depth } = world.config;
  return {
    width,
    depth,
    raycast(origin, direction) {
      const hit = raycastVoxels(world, origin, direction);
      return hit ? { distance: hit.distance, x: hit.cell.x, z: hit.cell.z } : null;
    },
    surfaceHeight(x, z) {
      const top = world.getHighestNonAirY(x, z);
      return top === null ? 0 : top + 1;
    },
    groundAt(x, z) {
      const surface = getTerrainSurfaceAtWorldPosition(world, { x, z });
      if (surface.valid) return surface.surfaceY;
      const column = Math.min(width - 1, Math.max(0, Math.floor(x + width / 2)));
      const row = Math.min(depth - 1, Math.max(0, Math.floor(z + depth / 2)));
      const top = world.getHighestNonAirY(column, row);
      return top === null ? 0 : top + 1;
    },
    columnZone: (x, z) => (x >= 0 && x < width && z >= 0 && z < depth ? world.zones[x + width * z] : 0),
    cellToWorld: cellToWorld(width, depth),
  };
}

/**
 * Terrain as one height per column. The ray walks the columns it passes over
 * (a 2D grid traversal) and stops at the first one whose ground it goes
 * below. Overhangs do not exist in this model; for picking zones and
 * deciding whether a hill hides an object that is exact enough.
 */
/** Ground heights are stored in 1/64 of a block (baked worlds, format 3); this marks a column with none. */
export const GROUND_UNITS = 64;
export const NO_GROUND = -32768;

export function createHeightfieldQuery(width: number, depth: number, heights: Int8Array, zones: Uint8Array, grounds?: Int16Array): WorldQuery {
  const heightAt = (x: number, z: number) => {
    const value = heights[x + width * z];
    return value === -128 ? -Infinity : value;
  };

  return {
    width,
    depth,
    raycast(origin, direction) {
      // Grid space: column (x, z) spans [x, x + 1) on each axis.
      const ox = origin.x + width / 2;
      const oz = origin.z + depth / 2;
      const { x: dx, y: dy, z: dz } = direction;

      // Clip the ray to the grid's footprint.
      let tNear = 0;
      let tFar = Infinity;
      for (const [o, d, size] of [[ox, dx, width], [oz, dz, depth]] as const) {
        if (d === 0) {
          if (o < 0 || o >= size) return null;
          continue;
        }
        const a = -o / d;
        const b = (size - o) / d;
        tNear = Math.max(tNear, Math.min(a, b));
        tFar = Math.min(tFar, Math.max(a, b));
      }
      if (tNear > tFar) return null;

      let t = tNear + 1e-4;
      let x = Math.floor(ox + dx * t);
      let z = Math.floor(oz + dz * t);
      const stepX = dx > 0 ? 1 : -1;
      const stepZ = dz > 0 ? 1 : -1;
      const deltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
      const deltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
      let nextX = dx !== 0 ? t + ((dx > 0 ? x + 1 - (ox + dx * t) : ox + dx * t - x) * deltaX) : Infinity;
      let nextZ = dz !== 0 ? t + ((dz > 0 ? z + 1 - (oz + dz * t) : oz + dz * t - z) * deltaZ) : Infinity;

      while (t <= tFar && x >= 0 && x < width && z >= 0 && z < depth) {
        const exit = Math.min(nextX, nextZ, tFar);
        const height = heightAt(x, z);
        const yEnter = origin.y + dy * t;
        const yExit = origin.y + dy * exit;
        if (yEnter <= height) return { distance: t, x, z };
        if (yExit <= height) return { distance: (height - origin.y) / dy, x, z };
        if (nextX < nextZ) {
          t = nextX;
          nextX += deltaX;
          x += stepX;
        } else {
          t = nextZ;
          nextZ += deltaZ;
          z += stepZ;
        }
      }
      return null;
    },
    surfaceHeight(x, z) {
      const height = x >= 0 && x < width && z >= 0 && z < depth ? heightAt(x, z) : -Infinity;
      return height === -Infinity ? 0 : height;
    },
    groundAt(x, z) {
      // One exact height per column, sampled at its centre when the world was baked.
      const column = Math.min(width - 1, Math.max(0, Math.floor(x + width / 2)));
      const row = Math.min(depth - 1, Math.max(0, Math.floor(z + depth / 2)));
      const ground = grounds ? grounds[column + width * row] : NO_GROUND;
      if (ground !== NO_GROUND) return ground / GROUND_UNITS;
      const height = heightAt(column, row);
      return height === -Infinity ? 0 : height;
    },
    columnZone: (x, z) => (x >= 0 && x < width && z >= 0 && z < depth ? zones[x + width * z] : 0),
    cellToWorld: cellToWorld(width, depth),
  };
}
