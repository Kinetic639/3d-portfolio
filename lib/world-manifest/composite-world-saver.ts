import { createMapDefinitionFromWorld, validateMapDefinition, type MapDefinition } from "@/lib/maps/map-definition";
import { getMapDraftStorageKey, saveMapDraft } from "@/lib/maps/map-registry";
import type { MapEntityAnchor } from "@/lib/world/map-document";
import { VoxelWorld } from "@/lib/world/voxel-world";
import { WORLD_CONFIG, type GridCoordinate } from "@/lib/world/world-config";
import { DEFAULT_ROTATION, DEFAULT_SHAPE_ID, DEFAULT_STATE } from "@/lib/voxel-shapes/shape-ids";
import { BLOCK_IDS } from "@/lib/world/block-registry";
import { FLUID_IDS } from "@/lib/fluids/fluid-types";
import type { LoadedCompositeWorldState } from "./composite-world-loader";
import { getRegionWorldOffset, globalToRegionLocal, regionLocalToGlobal } from "./world-region-coordinates";
import type { WorldRegionId } from "./world-manifest";

export type CompositeWorldSaveInput = Pick<LoadedCompositeWorldState, "manifest" | "sourceRegions"> & {
  world: VoxelWorld;
  definition: MapDefinition;
  markerAnchors: MapEntityAnchor[];
};

export function partitionCompositeWorld(input: CompositeWorldSaveInput): ReadonlyMap<WorldRegionId, MapDefinition> {
  const output = new Map<WorldRegionId, MapDefinition>();
  for (const region of input.manifest.regions) {
    const source = input.sourceRegions.get(region.id);
    if (!source) throw new Error(`Cannot save missing source region ${region.id}.`);
    const localWorld = extractRegionWorld(input.world, region.id);
    const owns = (coordinate: GridCoordinate) => globalToRegionLocal(coordinate)?.regionId === region.id;
    const localize = (coordinate: GridCoordinate) => {
      const local = globalToRegionLocal(coordinate);
      if (!local || local.regionId !== region.id) throw new Error(`Coordinate is outside region ${region.id}.`);
      return { x: local.x, y: local.y, z: local.z };
    };
    const isCenter = region.id === input.manifest.centerRegionId;
    const metadata = isCenter ? input.definition : source.definition;
    const regionEntityIds = new Set(input.definition.entities.filter((entity) => (
      worldPositionRegion(input.world, entity.transform.position) === region.id
    )).map((entity) => entity.id));
    const regionNodeIds = new Set(input.definition.navigation.nodes.filter((node) => (
      worldPositionRegion(input.world, node.position) === region.id
    )).map((node) => node.id));
    const offset = getRegionWorldOffset(region.id);
    const markers = (isCenter ? input.definition.markers : source.definition.markers)
      .filter((marker) => owns(marker.gridPosition))
      .map((marker) => ({ ...marker, gridPosition: localize(marker.gridPosition) }));
    const anchors = input.markerAnchors.filter((anchor) => owns(anchor.gridPosition));
    const definition = createMapDefinitionFromWorld({
      ...metadata,
      world: localWorld,
      zones: metadata.zones,
      markers,
      entities: input.definition.entities.filter((entity) => regionEntityIds.has(entity.id)).map((entity) => ({
        ...entity,
        transform: {
          ...entity.transform,
          position: {
            x: entity.transform.position.x - offset.x,
            y: entity.transform.position.y,
            z: entity.transform.position.z - offset.z,
          },
          rotation: { ...entity.transform.rotation },
          scale: { ...entity.transform.scale },
        },
      })),
      entityGroups: input.definition.entityGroups.filter((group) => (
        input.definition.entities.some((entity) => regionEntityIds.has(entity.id) && entity.groupId === group.id)
      )),
      navigation: {
        nodes: input.definition.navigation.nodes.filter((node) => regionNodeIds.has(node.id)).map((node) => ({
          ...node,
          position: { x: node.position.x - offset.x, y: node.position.y, z: node.position.z - offset.z },
        })),
        edges: input.definition.navigation.edges.filter((edge) => regionNodeIds.has(edge.fromNodeId) && regionNodeIds.has(edge.toNodeId)),
        routes: input.definition.navigation.routes
          .map((route) => ({ ...route, nodeIds: route.nodeIds.filter((id) => regionNodeIds.has(id)) }))
          .filter((route) => route.nodeIds.length > 0),
      },
      spawnPoints: metadata.spawnPoints.map((spawn) => isCenter ? {
        ...spawn,
        position: localize(spawn.position),
        cameraTarget: spawn.cameraTarget ? localize(spawn.cameraTarget) : undefined,
      } : spawn),
      cameraPresets: metadata.cameraPresets,
      presentation: metadata.presentation,
      metadata: { ...metadata.metadata, updatedAt: new Date().toISOString() },
      fluidSettings: metadata.fluids.settings,
    });
    definition.markers = markers;
    // Marker anchors are stored through marker definitions; reject orphaned
    // anchors rather than silently writing them into the wrong partition.
    if (anchors.some((anchor) => !markers.some((marker) => marker.id === anchor.id))) {
      throw new Error(`Region ${region.id} contains a marker anchor without a marker definition.`);
    }
    const validation = validateMapDefinition(definition);
    if (!validation.ok) throw new Error(`Region ${region.id} failed validation:\n${validation.errors.join("\n")}`);
    output.set(region.id, validation.map);
  }
  return output;
}

function worldPositionRegion(world: VoxelWorld, position: { x: number; z: number }) {
  const x = Math.floor(position.x / world.config.blockSize + world.config.width / 2);
  const z = Math.floor(position.z / world.config.blockSize + world.config.depth / 2);
  return globalToRegionLocal({ x, y: 0, z })?.regionId ?? null;
}

export function extractRegionWorld(composite: VoxelWorld, regionId: WorldRegionId) {
  const local = new VoxelWorld(WORLD_CONFIG);
  for (let y = WORLD_CONFIG.minY; y < WORLD_CONFIG.minY + WORLD_CONFIG.height; y += 1) {
    for (let z = 0; z < WORLD_CONFIG.depth; z += 1) {
      for (let x = 0; x < WORLD_CONFIG.width; x += 1) {
        const global = regionLocalToGlobal(regionId, { x, y, z });
        const blockId = composite.getBlock(global.x, y, global.z);
        const shapeId = composite.getShape(global.x, y, global.z);
        const rotation = composite.getRotation(global.x, y, global.z);
        const state = composite.getState(global.x, y, global.z);
        if (blockId !== BLOCK_IDS.Air || shapeId !== DEFAULT_SHAPE_ID || rotation !== DEFAULT_ROTATION || state !== DEFAULT_STATE) {
          local.setCell({ x, y, z, blockId, shapeId, rotation, state, zoneId: composite.getColumnZone(global.x, global.z) });
        }
        const fluid = composite.getFluid(global.x, y, global.z);
        if (fluid.type !== FLUID_IDS.None) local.setFluid(x, y, z, fluid);
      }
    }
  }
  for (let z = 0; z < WORLD_CONFIG.depth; z += 1) {
    for (let x = 0; x < WORLD_CONFIG.width; x += 1) {
      const global = regionLocalToGlobal(regionId, { x, y: 0, z });
      local.setColumnZone(x, z, composite.getColumnZone(global.x, global.z));
    }
  }
  local.clearDirtyChunks();
  local.clearDirtyZoneChunks();
  local.clearDirtyFluidChunks();
  return local;
}

export function saveCompositeRegionDrafts(storage: Storage, definitions: ReadonlyMap<WorldRegionId, MapDefinition>) {
  const previous = new Map<string, string | null>();
  for (const definition of definitions.values()) {
    const key = getMapDraftStorageKey(definition.id);
    previous.set(key, storage.getItem(key));
  }
  try {
    for (const definition of definitions.values()) saveMapDraft(storage, definition);
  } catch (error) {
    for (const [key, value] of previous) {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
    throw error;
  }
}
