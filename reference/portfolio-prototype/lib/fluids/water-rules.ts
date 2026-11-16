import { FLUID_IDS } from "./fluid-types";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import type { GridCoordinate } from "@/lib/world/world-config";

export const WATER_HORIZONTAL_DIRECTIONS = [
  { x: -1, z: 0 },
  { x: 0, z: -1 },
  { x: 0, z: 1 },
  { x: 1, z: 0 },
] as const;

export const DOWNWARD_ROUTE_LOOKAHEAD = 4;

export function canWaterEnter(world: VoxelWorld, coordinate: GridCoordinate) {
  return world.canContainFluid(coordinate.x, coordinate.y, coordinate.z, FLUID_IDS.Water);
}

export function hasDownwardOpening(world: VoxelWorld, coordinate: GridCoordinate) {
  if (coordinate.y === 0) return false;
  return canWaterEnter(world, { ...coordinate, y: coordinate.y - 1 });
}

export function selectHorizontalFlowTargets(world: VoxelWorld, origin: GridCoordinate) {
  const eligible = WATER_HORIZONTAL_DIRECTIONS.map((direction) => ({
    x: origin.x + direction.x,
    y: origin.y,
    z: origin.z + direction.z,
  })).filter((coordinate) => canWaterEnter(world, coordinate));

  const distances = eligible.map((coordinate) => findDownwardOpeningDistance(world, coordinate, origin));
  const validDistances = distances.filter((distance): distance is number => distance !== null);
  if (validDistances.length === 0) return eligible;
  const shortest = Math.min(...validDistances);
  return eligible.filter((_, index) => distances[index] === shortest);
}

function findDownwardOpeningDistance(world: VoxelWorld, start: GridCoordinate, origin: GridCoordinate) {
  const queue = [{ coordinate: start, distance: 0 }];
  const visited = new Set<string>([coordinateKey(origin), coordinateKey(start)]);

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (hasDownwardOpening(world, current.coordinate)) return current.distance;
    if (current.distance >= DOWNWARD_ROUTE_LOOKAHEAD) continue;

    for (const direction of WATER_HORIZONTAL_DIRECTIONS) {
      const next = {
        x: current.coordinate.x + direction.x,
        y: current.coordinate.y,
        z: current.coordinate.z + direction.z,
      };
      const key = coordinateKey(next);
      if (visited.has(key) || !canWaterEnter(world, next)) continue;
      visited.add(key);
      queue.push({ coordinate: next, distance: current.distance + 1 });
    }
  }
  return null;
}

function coordinateKey(coordinate: GridCoordinate) {
  return `${coordinate.x}:${coordinate.y}:${coordinate.z}`;
}
