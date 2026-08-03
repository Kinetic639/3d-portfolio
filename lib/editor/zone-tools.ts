import { getBrushFootprint, type TerrainBrushSettings } from "./terrain-brushes";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import type { GridCoordinate } from "@/lib/world/world-config";

export type ZoneEditMode = "paint" | "erase" | "replace";
export type ZoneSelectionMode = "brush" | "rectangle";

export type ZoneColumnChange = {
  coordinate: GridCoordinate;
  before: number;
  after: number;
};

export function getZoneBrushFootprint(center: GridCoordinate, settings: TerrainBrushSettings): GridCoordinate[] {
  return getBrushFootprint(center, settings).map((cell) => ({ x: cell.x, y: center.y, z: cell.z }));
}

export function getZoneRectangleFootprint(start: GridCoordinate, end: GridCoordinate): GridCoordinate[] {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minZ = Math.min(start.z, end.z);
  const maxZ = Math.max(start.z, end.z);
  const y = end.y;
  const cells: GridCoordinate[] = [];

  for (let z = minZ; z <= maxZ; z += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      cells.push({ x, y, z });
    }
  }

  return cells;
}

export function createZoneColumnChanges(input: {
  world: VoxelWorld;
  columns: GridCoordinate[];
  mode: ZoneEditMode;
  zoneId: number;
}): ZoneColumnChange[] {
  if (!Number.isInteger(input.zoneId) || input.zoneId < 0 || input.zoneId > 255) {
    return [];
  }

  const seen = new Set<string>();
  const changes: ZoneColumnChange[] = [];

  for (const column of input.columns) {
    if (input.world.getZoneIndex(column.x, column.z) === null) continue;
    const key = `${column.x},${column.z}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const before = input.world.getColumnZone(column.x, column.z);
    const after = resolveZoneAfter(before, input.mode, input.zoneId);
    if (before === after) continue;
    changes.push({
      coordinate: { x: column.x, y: column.y, z: column.z },
      before,
      after,
    });
  }

  return changes;
}

function resolveZoneAfter(before: number, mode: ZoneEditMode, zoneId: number) {
  switch (mode) {
    case "erase":
      return 0;
    case "paint":
      return before === 0 ? zoneId : before;
    case "replace":
      return zoneId;
  }
}
