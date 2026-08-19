import { loadMapStateSync } from "@/lib/maps/map-registry";
import { cloneMapDefinition, type LoadedMapState, type MapDefinition } from "@/lib/maps/map-definition";
import type { MapEntityAnchor } from "@/lib/world/map-document";
import { VoxelWorld } from "@/lib/world/voxel-world";
import { COMPOSITE_WORLD_CONFIG } from "@/lib/world/world-config";
import {
  DEFAULT_SHAPE_ID,
  DEFAULT_ROTATION,
  DEFAULT_STATE,
  type CellRotation,
  type ShapeId,
} from "@/lib/voxel-shapes/shape-ids";
import { BLOCK_IDS, type BlockId } from "@/lib/world/block-registry";
import { FLUID_IDS } from "@/lib/fluids/fluid-types";
import { resolveWorldManifestSync, DEFAULT_WORLD_MANIFEST_ID } from "./world-manifest-registry";
import { getRegionWorldOffset, regionLocalToGlobal } from "./world-region-coordinates";
import type { WorldManifest, WorldRegionId } from "./world-manifest";

export type LoadedCompositeWorldState = LoadedMapState & {
  manifest: WorldManifest;
  sourceRegions: ReadonlyMap<WorldRegionId, LoadedMapState>;
};

export function loadCompositeWorldStateSync(
  manifestId = DEFAULT_WORLD_MANIFEST_ID,
  options: { loadRegion?: (mapId: string) => LoadedMapState } = {},
): LoadedCompositeWorldState {
  const manifest = resolveWorldManifestSync(manifestId);
  const world = new VoxelWorld(COMPOSITE_WORLD_CONFIG);
  const sourceRegions = new Map<WorldRegionId, LoadedMapState>();

  for (const region of manifest.regions) {
    const source = options.loadRegion?.(region.mapId) ?? loadMapStateSync(region.mapId, { includeDevelopment: true });
    sourceRegions.set(region.id, source);
    copyRegionIntoComposite(world, region.id, source.world);
  }

  const center = sourceRegions.get("center");
  if (!center) throw new Error(`World manifest ${manifest.id} does not contain a loaded center region.`);
  const definition = createCompositeDefinition(center.definition, sourceRegions);
  const entities = [...sourceRegions.entries()].flatMap(([regionId, state]) => (
    state.entities.map((entity) => translateAnchor(entity, regionId))
  ));
  world.clearDirtyChunks();
  world.clearDirtyZoneChunks();
  world.clearDirtyFluidChunks();

  return {
    manifest,
    sourceRegions,
    definition,
    world,
    entities,
    fluidLoad: combineFluidLoadStates([...sourceRegions.values()]),
  };
}

function copyRegionIntoComposite(target: VoxelWorld, regionId: WorldRegionId, source: VoxelWorld) {
  for (let index = 0; index < source.blocks.length; index += 1) {
    const coordinate = source.getCoordinates(index);
    if (!coordinate) continue;
    const blockId = source.blocks[index];
    const shapeId = source.shapes[index];
    const rotation = source.rotations[index];
    const state = source.states[index];
    if (blockId === BLOCK_IDS.Air && shapeId === DEFAULT_SHAPE_ID && rotation === DEFAULT_ROTATION && state === DEFAULT_STATE) continue;
    const global = regionLocalToGlobal(regionId, coordinate);
    target.setCell({
      ...global,
      blockId: blockId as BlockId,
      shapeId: shapeId as ShapeId,
      rotation: rotation as CellRotation,
      state,
      zoneId: source.getColumnZone(coordinate.x, coordinate.z),
    });
  }

  for (let z = 0; z < source.config.depth; z += 1) {
    for (let x = 0; x < source.config.width; x += 1) {
      const zoneId = source.getColumnZone(x, z);
      if (zoneId === 0) continue;
      const global = regionLocalToGlobal(regionId, { x, y: 0, z });
      target.setColumnZone(global.x, global.z, zoneId);
    }
  }

  for (let index = 0; index < source.fluidTypes.length; index += 1) {
    if (source.fluidTypes[index] === FLUID_IDS.None) continue;
    const coordinate = source.getCoordinates(index);
    if (!coordinate) continue;
    const global = regionLocalToGlobal(regionId, coordinate);
    target.setFluid(global.x, global.y, global.z, source.getFluid(coordinate.x, coordinate.y, coordinate.z));
  }
}

function createCompositeDefinition(source: MapDefinition, regions: ReadonlyMap<WorldRegionId, LoadedMapState>): MapDefinition {
  const definition = cloneMapDefinition(source);
  definition.zoneAssignments = definition.zoneAssignments.map((assignment) => {
    const global = regionLocalToGlobal("center", { x: assignment.x, y: assignment.y ?? 0, z: assignment.z });
    return { ...assignment, x: global.x, z: global.z };
  });
  definition.fluids = {
    ...definition.fluids,
    sources: definition.fluids.sources.map((source) => ({
      ...source,
      ...regionLocalToGlobal("center", source),
    })),
    // The source-region fingerprint is not valid for the assembled world.
    settledCache: undefined,
  };
  definition.markers = definition.markers.map((marker) => ({
    ...marker,
    gridPosition: regionLocalToGlobal("center", marker.gridPosition),
  }));
  definition.spawnPoints = definition.spawnPoints.map((spawn) => ({
    ...spawn,
    position: regionLocalToGlobal("center", spawn.position),
    cameraTarget: spawn.cameraTarget ? regionLocalToGlobal("center", spawn.cameraTarget) : undefined,
  }));
  for (const [regionId, state] of regions) {
    if (regionId === "center") continue;
    const offset = getRegionWorldOffset(regionId);
    definition.markers.push(...state.definition.markers.map((marker) => ({
      ...marker,
      gridPosition: regionLocalToGlobal(regionId, marker.gridPosition),
    })));
    definition.entities.push(...state.definition.entities.map((entity) => ({
      ...entity,
      transform: {
        ...entity.transform,
        position: translateSceneryWorldPosition(regionId, entity.transform.position),
        rotation: { ...entity.transform.rotation },
        scale: { ...entity.transform.scale },
      },
    })));
    definition.entityGroups.push(...state.definition.entityGroups.map((group) => ({ ...group })));
    definition.navigation.nodes.push(...state.definition.navigation.nodes.map((node) => ({
      ...node,
      position: { x: node.position.x + offset.x, y: node.position.y, z: node.position.z + offset.z },
    })));
    definition.navigation.edges.push(...state.definition.navigation.edges.map((edge) => ({ ...edge })));
    definition.navigation.routes.push(...state.definition.navigation.routes.map((route) => ({ ...route, nodeIds: [...route.nodeIds] })));
  }
  return definition;
}

function translateAnchor(entity: MapEntityAnchor, regionId: WorldRegionId): MapEntityAnchor {
  return { ...entity, gridPosition: regionLocalToGlobal(regionId, entity.gridPosition) };
}

function combineFluidLoadStates(states: LoadedMapState[]): LoadedMapState["fluidLoad"] {
  const fluidLoads = states.map((state) => state.fluidLoad);
  return {
    cacheStatus: fluidLoads.some((state) => state.cacheStatus === "rebuilt")
      ? "rebuilt"
      : fluidLoads.some((state) => state.cacheStatus === "hit") ? "hit" : "empty",
    settled: fluidLoads.every((state) => state.settled),
  };
}

export function translateSceneryWorldPosition(regionId: WorldRegionId, position: { x: number; y: number; z: number }) {
  const offset = getRegionWorldOffset(regionId);
  return { x: position.x + offset.x, y: position.y, z: position.z + offset.z };
}
