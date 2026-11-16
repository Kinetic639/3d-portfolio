import { clonePlacedEntity, type PlacedMapEntity } from "@/lib/maps/map-entities";
import { getTerrainSurfaceAtWorld, type TerrainSurface } from "@/lib/world/surface-query";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import { resolvePrefabFootprint, resolvePrefabVisualBounds } from "./prefab-resolver";

export type PrefabFootprintSupport = {
  cells: TerrainSurface[];
  minSurfaceY: number;
  maxSurfaceY: number;
};

export type PrefabGroundingResult =
  | { ok: true; entity: PlacedMapEntity; support: PrefabFootprintSupport; visualMinY: number; surfaceY: number }
  | { ok: false; reason: string };

export function groundEntityOnTerrain(
  world: VoxelWorld,
  entity: PlacedMapEntity,
  options: { maxSupportHeightDifference?: number; groundOffset?: number; supportMode?: "single-cell" | "entire-footprint" } = {},
): PrefabGroundingResult {
  const support = getEntityFootprintSupport(world, entity, options.supportMode ?? "single-cell");
  if (!support.ok) {
    return support;
  }
  const maxDifference = options.maxSupportHeightDifference ?? (options.supportMode === "entire-footprint" ? 0.01 : 1);
  if (support.support.maxSurfaceY - support.support.minSurfaceY > maxDifference) {
    return { ok: false, reason: "Footprint support height difference exceeds placement limit." };
  }

  const entityAtZero = clonePlacedEntity(entity);
  entityAtZero.transform.position.y = 0;
  const localBounds = resolvePrefabVisualBounds(entityAtZero);
  if (!localBounds) {
    return { ok: false, reason: "Prefab visual bounds could not be resolved." };
  }

  const grounded = clonePlacedEntity(entity);
  const surfaceY = options.supportMode === "entire-footprint" ? support.support.maxSurfaceY : support.support.cells[0].surfaceY;
  grounded.transform.position.y = roundPlacementY(surfaceY - localBounds.minY + (options.groundOffset ?? 0));
  const worldBounds = resolvePrefabVisualBounds(grounded);

  return {
    ok: true,
    entity: grounded,
    support: support.support,
    visualMinY: worldBounds?.minY ?? grounded.transform.position.y,
    surfaceY,
  };
}

export function getEntityFootprintSupport(
  world: VoxelWorld,
  entity: PlacedMapEntity,
  supportMode: "single-cell" | "entire-footprint" = "single-cell",
): { ok: true; support: PrefabFootprintSupport } | { ok: false; reason: string } {
  const cells = supportMode === "single-cell"
    ? [{ x: entity.transform.position.x, z: entity.transform.position.z }]
    : getRotatedFootprintSamplePositions(entity);
  const surfaces: TerrainSurface[] = [];

  for (const cell of cells) {
    const surface = getTerrainSurfaceAtWorld(world, cell);
    if (!surface.valid) {
      return { ok: false, reason: surface.reason };
    }
    surfaces.push(surface);
  }

  return {
    ok: true,
    support: {
      cells: surfaces,
      minSurfaceY: Math.min(...surfaces.map((surface) => surface.surfaceY)),
      maxSurfaceY: Math.max(...surfaces.map((surface) => surface.surfaceY)),
    },
  };
}

function getRotatedFootprintSamplePositions(entity: PlacedMapEntity) {
  const footprint = resolvePrefabFootprint(entity);
  const halfWidth = Math.max(0.5, footprint.width / 2);
  const halfDepth = Math.max(0.5, footprint.depth / 2);
  const cos = Math.cos(entity.transform.rotation.y);
  const sin = Math.sin(entity.transform.rotation.y);
  const samples = [
    { x: 0, z: 0 },
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: -halfWidth, z: halfDepth },
    { x: halfWidth, z: halfDepth },
  ];

  return samples.map((sample) => ({
    x: entity.transform.position.x + sample.x * cos - sample.z * sin,
    z: entity.transform.position.z + sample.x * sin + sample.z * cos,
  }));
}

function roundPlacementY(value: number) {
  return Number(value.toFixed(4));
}
