import { buildSurfaceChunkMesh, buildSurfaceChunkMeshes, type SurfaceMeshingCell } from "@/lib/terrain/surface-mesher";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import { WORLD_CONFIG, type GridCoordinate } from "@/lib/world/world-config";
import { globalCellToRegionCell } from "./world-layout-coordinates";
import type { WorldRegionId } from "./world-layout-types";
import { WORLD_REGION_SLOTS } from "./world-region";

export type RegionWorlds = Readonly<Partial<Record<WorldRegionId, VoxelWorld>>>;

export function buildRegionSurfaceMeshes(regionId: WorldRegionId, worlds: RegionWorlds, namespaceChunkIds = true) {
  const world = worlds[regionId];
  if (!world) throw new Error(`Cannot mesh unloaded world region ${regionId}.`);
  return buildSurfaceChunkMeshes(world, createMeshingContext(regionId, worlds, namespaceChunkIds));
}

export function buildRegionSurfaceChunkMesh(
  regionId: WorldRegionId,
  worlds: RegionWorlds,
  chunkX: number,
  chunkZ: number,
  namespaceChunkId = true,
) {
  const world = worlds[regionId];
  if (!world) throw new Error(`Cannot mesh unloaded world region ${regionId}.`);
  return buildSurfaceChunkMesh(world, chunkX, chunkZ, createMeshingContext(regionId, worlds, namespaceChunkId));
}

export function markRegionTerrainDirtyForCell(
  worlds: RegionWorlds,
  regionId: WorldRegionId,
  local: Pick<GridCoordinate, "x" | "z">,
) {
  const world = worlds[regionId];
  if (!world || !isInsideRegionColumn(local)) return;
  world.markChunkDirtyForCell(local.x, local.z);

  const slot = WORLD_REGION_SLOTS[regionId];
  const neighbours: Array<{ applies: boolean; offsetX: number; offsetZ: number; x: number; z: number }> = [
    { applies: local.x === 0, offsetX: -1, offsetZ: 0, x: WORLD_CONFIG.width - 1, z: local.z },
    { applies: local.x === WORLD_CONFIG.width - 1, offsetX: 1, offsetZ: 0, x: 0, z: local.z },
    { applies: local.z === 0, offsetX: 0, offsetZ: -1, x: local.x, z: WORLD_CONFIG.depth - 1 },
    { applies: local.z === WORLD_CONFIG.depth - 1, offsetX: 0, offsetZ: 1, x: local.x, z: 0 },
  ];

  for (const neighbour of neighbours) {
    if (!neighbour.applies) continue;
    const neighbourSlot = Object.values(WORLD_REGION_SLOTS).find((candidate) => (
      candidate.offset.x === slot.offset.x + neighbour.offsetX
      && candidate.offset.z === slot.offset.z + neighbour.offsetZ
    ));
    const neighbourWorld = neighbourSlot ? worlds[neighbourSlot.id] : undefined;
    neighbourWorld?.markChunkDirtyForCell(neighbour.x, neighbour.z);
  }
}

function getRegionCell(worlds: RegionWorlds, globalCoordinate: GridCoordinate): SurfaceMeshingCell | null {
  const coordinate = globalCellToRegionCell(globalCoordinate);
  if (!coordinate) return null;
  const world = worlds[coordinate.regionId];
  if (!world) return null;
  const { x, y, z } = coordinate.local;
  return {
    blockId: world.getBlock(x, y, z),
    shapeId: world.getShape(x, y, z),
    rotation: world.getRotation(x, y, z),
    state: world.getState(x, y, z),
  };
}

function createMeshingContext(regionId: WorldRegionId, worlds: RegionWorlds, namespaceChunkId: boolean) {
  const offset = WORLD_REGION_SLOTS[regionId].offset;
  return {
    cellOffset: {
      x: offset.x * WORLD_CONFIG.width,
      z: offset.z * WORLD_CONFIG.depth,
    },
    chunkIdPrefix: namespaceChunkId ? regionId : undefined,
    loaderPlatformEnabled: regionId === "center",
    getCell: (globalCoordinate: GridCoordinate) => getRegionCell(worlds, globalCoordinate),
  };
}

function isInsideRegionColumn(local: Pick<GridCoordinate, "x" | "z">) {
  return Number.isInteger(local.x)
    && Number.isInteger(local.z)
    && local.x >= 0
    && local.x < WORLD_CONFIG.width
    && local.z >= 0
    && local.z < WORLD_CONFIG.depth;
}
