import { BLOCK_IDS, isKnownBlockId } from "@/lib/world/block-registry";
import {
  createMapStateFromDocument,
  serializeMapDocument,
  type MapBlockEdit,
  type MapDocument,
  type MapEntityAnchor,
  type MapZoneAssignment,
} from "@/lib/world/map-document";
import { VoxelWorld } from "@/lib/world/voxel-world";
import { WORLD_CONFIG, type GridCoordinate } from "@/lib/world/world-config";
import { isKnownShapeId } from "@/lib/voxel-shapes/shape-ids";
import { incrementEditorPerfCounter } from "@/lib/editor/editor-performance-counters";
import {
  cloneEntityGroup,
  clonePlacedEntity,
  ENTITY_COLLISION_MODES,
  ENTITY_PRIMITIVE_TYPES,
  ENTITY_TYPES,
  type EntityGroupDefinition,
  type PlacedMapEntity,
} from "./map-entities";
import { getPrefabDefinition } from "@/lib/prefabs/prefab-library";
import {
  cloneNavigationDefinition,
  createEmptyNavigationDefinition,
  type MapNavigationDefinition,
  type NavigationNodeType,
} from "./map-navigation";
import { DEFAULT_FLUID_SETTINGS, type FluidDocument, validateFluidDocument } from "@/lib/fluids/fluid-document";

export const MAP_DEFINITION_SCHEMA_VERSION = 4;

export type MapRuntimeMode = "baked-static" | "dynamic-voxel";
export type MapKind = "portfolio" | "interior" | "minigame" | "test" | "custom";
export type MapContentType = "project" | "about" | "experience" | "skillGroup" | "contact";
export type MapEntityType = "point-of-interest" | "spawn-point" | "portal" | "trigger" | "decoration-anchor";

export type SerializedBlockData = {
  encoding: "flat-edits-v1" | "cell-edits-v2";
  generator: "flat-v1";
  edits: MapBlockEdit[];
};

export type MapZoneDefinition = {
  id: string;
  numericId: number;
  label: string;
  shortLabel?: string;
  description?: string;
  color: string;
  displayOrder: number;
  visibleInLegend: boolean;
  overlayVisible: boolean;
  locked: boolean;
  defaultFocusMarkerId?: string;
  focusDirection?: MapZoneFocusDirection;
};

export type MapZoneFocusDirection = "north" | "south" | "east" | "west" | "northeast" | "northwest" | "southeast" | "southwest";

export type MapContentReference = {
  contentType: MapContentType;
  contentId: string;
};

export type MapMarkerDefinition = {
  id: string;
  type: "marker";
  markerType: "primary" | "secondary" | "project" | "info" | "contact";
  label: string;
  zoneId?: string;
  gridPosition: GridCoordinate;
  offset?: { x: number; y: number; z: number };
  rotationY: number;
  focusCameraPresetId?: string;
  contentReference?: MapContentReference;
  developmentVisible: boolean;
  runtimeVisible: boolean;
  interactionRadius: number;
};

export type MapSpawnPoint = {
  id: string;
  label: string;
  position: GridCoordinate;
  rotationY: number;
  cameraTarget?: GridCoordinate;
};

export type MapCameraPreset = {
  id: string;
  label: string;
  cameraPosition: { x: number; y: number; z: number };
  controlsTarget: { x: number; y: number; z: number };
  zoom?: number;
  minDistance?: number;
  maxDistance?: number;
  transitionDuration?: number;
  preferredPolarAngle?: number;
};

export type MapPresentationConfig = {
  legendVisible: boolean;
  environmentId?: string;
  backgroundId?: string;
};

export type MapDefinition = {
  schemaVersion: 1 | 2 | 3 | 4;
  id: string;
  name: string;
  description?: string;
  kind: MapKind;
  runtimeMode: MapRuntimeMode;
  dimensions: {
    width: 64;
    minY: number;
    height: number;
    depth: 64;
  };
  blockSize: 1;
  blocks: SerializedBlockData;
  fluids: FluidDocument;
  zoneAssignments: MapZoneAssignment[];
  zones: MapZoneDefinition[];
  markers: MapMarkerDefinition[];
  entities: PlacedMapEntity[];
  entityGroups: EntityGroupDefinition[];
  navigation: MapNavigationDefinition;
  spawnPoints: MapSpawnPoint[];
  cameraPresets: MapCameraPreset[];
  defaultSpawnId?: string;
  defaultCameraPresetId?: string;
  presentation: MapPresentationConfig;
  metadata: {
    createdAt?: string;
    updatedAt?: string;
    authoringVersion?: string;
  };
};

export type MapDefinitionValidationResult =
  | { ok: true; map: MapDefinition }
  | { ok: false; errors: string[] };

export type LoadedMapState = {
  definition: MapDefinition;
  world: VoxelWorld;
  entities: MapEntityAnchor[];
  fluidLoad: import("@/lib/fluids/fluid-document").FluidLoadResult;
};

export function createMapDefinitionFromWorld(input: {
  id: string;
  name: string;
  description?: string;
  kind: MapKind;
  runtimeMode: MapRuntimeMode;
  world: VoxelWorld;
  zones: MapZoneDefinition[];
  markers: MapMarkerDefinition[];
  entities?: PlacedMapEntity[];
  entityGroups?: EntityGroupDefinition[];
  navigation?: MapNavigationDefinition;
  spawnPoints: MapSpawnPoint[];
  cameraPresets: MapCameraPreset[];
  defaultSpawnId?: string;
  defaultCameraPresetId?: string;
  presentation?: Partial<MapPresentationConfig>;
  metadata?: MapDefinition["metadata"];
  fluidSettings?: import("@/lib/fluids/fluid-document").FluidSettings;
}): MapDefinition {
  const document = serializeMapDocument(input.world, markersToEntityAnchors(input.markers), input.fluidSettings);

  return {
    schemaVersion: MAP_DEFINITION_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    description: input.description,
    kind: input.kind,
    runtimeMode: input.runtimeMode,
    dimensions: {
      width: WORLD_CONFIG.width,
      minY: WORLD_CONFIG.minY,
      height: WORLD_CONFIG.height,
      depth: WORLD_CONFIG.depth,
    },
    blockSize: WORLD_CONFIG.blockSize,
    blocks: {
      encoding: document.cellEncoding ?? "cell-edits-v2",
      generator: "flat-v1",
      edits: document.edits,
    },
    fluids: document.fluids!,
    zoneAssignments: document.zones,
    zones: input.zones.map(cloneZone),
    markers: input.markers.map(cloneMarker),
    entities: input.entities?.map(clonePlacedEntity) ?? [],
    entityGroups: input.entityGroups?.map(cloneEntityGroup) ?? [],
    navigation: input.navigation ? cloneNavigationDefinition(input.navigation) : createEmptyNavigationDefinition(),
    spawnPoints: input.spawnPoints.map(cloneSpawnPoint),
    cameraPresets: input.cameraPresets.map(cloneCameraPreset),
    defaultSpawnId: input.defaultSpawnId,
    defaultCameraPresetId: input.defaultCameraPresetId,
    presentation: {
      legendVisible: input.presentation?.legendVisible ?? true,
      environmentId: input.presentation?.environmentId,
      backgroundId: input.presentation?.backgroundId,
    },
    metadata: { ...input.metadata },
  };
}

export function createBlankMapDefinition(input: {
  id: string;
  name: string;
  flatBaseLayer?: boolean;
  kind?: MapKind;
  runtimeMode?: MapRuntimeMode;
}): MapDefinition {
  const world = new VoxelWorld();

  if (input.flatBaseLayer) {
    for (let z = 0; z < WORLD_CONFIG.depth; z += 1) {
      for (let x = 0; x < WORLD_CONFIG.width; x += 1) {
        world.setBlock(x, 0, z, BLOCK_IDS.Ground);
      }
    }
    world.clearDirtyChunks();
  }

  return createMapDefinitionFromWorld({
    id: input.id,
    name: input.name,
    kind: input.kind ?? "custom",
    runtimeMode: input.runtimeMode ?? "dynamic-voxel",
    world,
    zones: [],
    markers: [],
    spawnPoints: [{
      id: "overview",
      label: "Overview",
      position: { x: 31, y: 1, z: 31 },
      rotationY: 0,
      cameraTarget: { x: 31, y: 0, z: 31 },
    }],
    cameraPresets: [createDefaultOverviewCameraPreset()],
    defaultSpawnId: "overview",
    defaultCameraPresetId: "overview",
  });
}

export function cloneMapDefinition(map: MapDefinition): MapDefinition {
  const migrated = migrateMapDefinition(map);
  return {
    ...migrated,
    dimensions: { ...migrated.dimensions },
    blocks: { ...migrated.blocks, edits: migrated.blocks.edits.map((edit) => ({ ...edit })) },
    fluids: cloneFluidDocument(migrated.fluids),
    zoneAssignments: migrated.zoneAssignments.map((zone) => ({ ...zone })),
    zones: migrated.zones.map(cloneZone),
    markers: migrated.markers.map(cloneMarker),
    entities: migrated.entities.map(clonePlacedEntity),
    entityGroups: migrated.entityGroups.map(cloneEntityGroup),
    navigation: cloneNavigationDefinition(migrated.navigation),
    spawnPoints: migrated.spawnPoints.map(cloneSpawnPoint),
    cameraPresets: migrated.cameraPresets.map(cloneCameraPreset),
    presentation: { ...migrated.presentation },
    metadata: { ...migrated.metadata },
  };
}

export function duplicateMapDefinition(map: MapDefinition, id: string, name: string): MapDefinition {
  const copy = cloneMapDefinition(map);
  return {
    ...copy,
    id,
    name,
    metadata: {
      ...copy.metadata,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function mapDefinitionToDocument(map: MapDefinition): MapDocument {
  return {
    version: 5,
    cellEncoding: map.blocks.encoding,
    zoneEncoding: "column-zones-v2",
    world: {
      width: WORLD_CONFIG.width,
      depth: WORLD_CONFIG.depth,
      minY: WORLD_CONFIG.minY,
      height: WORLD_CONFIG.height,
      blockSize: WORLD_CONFIG.blockSize,
      chunkSize: WORLD_CONFIG.chunkSize,
      generator: "flat-v1",
    },
    edits: map.blocks.edits.map((edit) => ({ ...edit })),
    zones: map.zoneAssignments.map((zone) => ({ ...zone })),
    entities: markersToEntityAnchors(map.markers),
    fluids: cloneFluidDocument(map.fluids),
  };
}

export function createLoadedMapState(map: MapDefinition): LoadedMapState {
  const validation = validateMapDefinition(map);
  if (!validation.ok) {
    throw new Error(validation.errors.join("\n"));
  }

  const state = createMapStateFromDocument(mapDefinitionToDocument(map));

  return {
    definition: cloneMapDefinition(map),
    world: state.world,
    entities: state.entities,
    fluidLoad: state.fluidLoad,
  };
}

export function validateMapDefinition(input: unknown): MapDefinitionValidationResult {
  incrementEditorPerfCounter("mapValidations");
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ["Map definition must be an object."] };
  }

  const map = migrateMapDefinition(input as MapDefinition);
  if (map.schemaVersion !== MAP_DEFINITION_SCHEMA_VERSION) {
    errors.push(`Unsupported map schema version: ${String(map.schemaVersion)}.`);
  }
  if (!isStableId(map.id)) {
    errors.push("Map id must be a stable lowercase id.");
  }
  if (typeof map.name !== "string" || map.name.trim().length === 0) {
    errors.push("Map name is required.");
  }
  if (map.kind && !["portfolio", "interior", "minigame", "test", "custom"].includes(map.kind)) {
    errors.push(`Unknown map kind: ${String(map.kind)}.`);
  }
  if (map.runtimeMode && !["baked-static", "dynamic-voxel"].includes(map.runtimeMode)) {
    errors.push(`Unknown runtime mode: ${String(map.runtimeMode)}.`);
  }
  if (!hasExpectedDimensions(map)) {
    errors.push(`Map dimensions must match 64 x 64 x ${WORLD_CONFIG.height} from Y=${WORLD_CONFIG.minY} with block size 1.`);
  }
  if (
    !isRecord(map.blocks) ||
    (map.blocks.encoding !== "flat-edits-v1" && map.blocks.encoding !== "cell-edits-v2") ||
    map.blocks.generator !== "flat-v1"
  ) {
    errors.push("Map blocks must use flat-edits-v1 or cell-edits-v2 storage.");
  } else {
    validateBlockEdits(map.blocks.edits, errors);
  }
  const fluids = validateFluidDocument(map.fluids);
  if (!fluids.ok) errors.push(fluids.error);

  const zoneIds = new Set<string>();
  const zoneNumericIds = new Set<number>();
  for (const zone of map.zones ?? []) {
    if (!isStableId(zone.id)) errors.push(`Invalid zone id: ${String(zone.id)}.`);
    if (zoneIds.has(zone.id)) errors.push(`Duplicate zone id: ${zone.id}.`);
    if (zoneNumericIds.has(zone.numericId)) errors.push(`Duplicate zone numeric id: ${zone.numericId}.`);
    if (!Number.isInteger(zone.numericId) || zone.numericId < 1 || zone.numericId > 255) {
      errors.push(`Zone ${zone.id} numeric id must be 1-255.`);
    }
    if (typeof zone.color !== "string" || !/^#[0-9a-f]{6}$/i.test(zone.color)) {
      errors.push(`Zone ${zone.id} must include a hex colour.`);
    }
    if (zone.focusDirection && !isZoneFocusDirection(zone.focusDirection)) {
      errors.push(`Zone ${zone.id} has invalid focus direction: ${String(zone.focusDirection)}.`);
    }
    zoneIds.add(zone.id);
    zoneNumericIds.add(zone.numericId);
  }

  const markerIds = new Set<string>();
  for (const marker of map.markers ?? []) {
    if (!isStableId(marker.id)) errors.push(`Invalid marker id: ${String(marker.id)}.`);
    if (markerIds.has(marker.id)) errors.push(`Duplicate marker id: ${marker.id}.`);
    if (marker.zoneId && !zoneIds.has(marker.zoneId)) errors.push(`Marker ${marker.id} references unknown zone ${marker.zoneId}.`);
    if (!isGridCoordinate(marker.gridPosition)) errors.push(`Marker ${marker.id} position is invalid.`);
    if (marker.focusCameraPresetId && !(map.cameraPresets ?? []).some((preset) => preset.id === marker.focusCameraPresetId)) {
      errors.push(`Marker ${marker.id} references unknown camera preset ${marker.focusCameraPresetId}.`);
    }
    markerIds.add(marker.id);
  }

  validatePlacedEntities(map.entities, map.entityGroups, zoneIds, markerIds, errors);
  validateNavigation(map.navigation, zoneIds, errors);

  const spawnIds = new Set<string>();
  for (const spawn of map.spawnPoints ?? []) {
    if (!isStableId(spawn.id)) errors.push(`Invalid spawn id: ${String(spawn.id)}.`);
    if (spawnIds.has(spawn.id)) errors.push(`Duplicate spawn id: ${spawn.id}.`);
    if (!isGridCoordinate(spawn.position)) errors.push(`Spawn ${spawn.id} position is invalid.`);
    spawnIds.add(spawn.id);
  }

  const cameraIds = new Set<string>();
  for (const preset of map.cameraPresets ?? []) {
    if (!isStableId(preset.id)) errors.push(`Invalid camera preset id: ${String(preset.id)}.`);
    if (cameraIds.has(preset.id)) errors.push(`Duplicate camera preset id: ${preset.id}.`);
    cameraIds.add(preset.id);
  }

  if (map.defaultSpawnId && !spawnIds.has(map.defaultSpawnId)) {
    errors.push(`Default spawn ${map.defaultSpawnId} does not exist.`);
  }
  if (map.defaultCameraPresetId && !cameraIds.has(map.defaultCameraPresetId)) {
    errors.push(`Default camera preset ${map.defaultCameraPresetId} does not exist.`);
  }

  const numericZoneIds = new Set((map.zones ?? []).map((zone) => zone.numericId));
  validateZoneAssignments(map.zoneAssignments, numericZoneIds, errors);

  return errors.length > 0 ? { ok: false, errors } : { ok: true, map: cloneMapDefinition(map) };
}

export function migrateMapDefinition(input: MapDefinition): MapDefinition {
  return {
    ...input,
    schemaVersion: MAP_DEFINITION_SCHEMA_VERSION,
    dimensions: {
      ...input.dimensions,
      minY: WORLD_CONFIG.minY,
      height: WORLD_CONFIG.height,
    },
    fluids: input.fluids ?? {
      encoding: "fluid-sources-v1",
      settings: { ...DEFAULT_FLUID_SETTINGS },
      sources: [],
    },
    entities: Array.isArray(input.entities) ? input.entities.map(clonePlacedEntity) : [],
    entityGroups: Array.isArray(input.entityGroups) ? input.entityGroups.map(cloneEntityGroup) : [],
    navigation: input.navigation ? cloneNavigationDefinition({
      nodes: Array.isArray(input.navigation.nodes) ? input.navigation.nodes : [],
      edges: Array.isArray(input.navigation.edges) ? input.navigation.edges : [],
      routes: Array.isArray(input.navigation.routes) ? input.navigation.routes : [],
    }) : createEmptyNavigationDefinition(),
  };
}

function cloneFluidDocument(fluids: FluidDocument): FluidDocument {
  return {
    encoding: fluids.encoding,
    settings: { ...fluids.settings },
    sources: fluids.sources.map((source) => ({ ...source })),
    ...(fluids.settledCache ? { settledCache: {
      ...fluids.settledCache,
      cells: fluids.settledCache.cells.map((cell) => ({ ...cell })),
    } } : {}),
  };
}

export function createDefaultOverviewCameraPreset(): MapCameraPreset {
  return {
    id: "overview",
    label: "Overview",
    cameraPosition: { x: 42, y: 52, z: 62 },
    controlsTarget: { x: 0, y: 0, z: 0 },
    transitionDuration: 1.2,
  };
}

export function markerToEntityAnchor(marker: MapMarkerDefinition): MapEntityAnchor {
  return {
    id: marker.id,
    type: "marker",
    gridPosition: { ...marker.gridPosition },
    rotationY: marker.rotationY,
    offset: marker.offset ? { ...marker.offset } : undefined,
    metadata: {
      markerType: marker.markerType,
      label: marker.label,
      zoneId: marker.zoneId ?? "",
      contentType: marker.contentReference?.contentType ?? "",
      contentId: marker.contentReference?.contentId ?? "",
    },
  };
}

export function markersToEntityAnchors(markers: MapMarkerDefinition[]): MapEntityAnchor[] {
  return markers.map(markerToEntityAnchor);
}

function validateBlockEdits(edits: unknown, errors: string[]) {
  if (!Array.isArray(edits)) {
    errors.push("Block edits must be an array.");
    return;
  }

  const seen = new Set<string>();
  for (const edit of edits) {
    if (!isRecord(edit) || !isGridCoordinate(edit)) {
      errors.push("Every block edit must include integer x, y and z.");
      continue;
    }
    const blockId = (edit as Record<string, unknown>).blockId;
    const shapeId = (edit as Record<string, unknown>).shapeId;
    const rotation = (edit as Record<string, unknown>).rotation;
    const state = (edit as Record<string, unknown>).state;
    const key = `${edit.x},${edit.y},${edit.z}`;
    if (seen.has(key)) errors.push(`Duplicate block edit coordinate: ${key}.`);
    if (typeof blockId !== "number" || !isKnownBlockId(blockId)) errors.push(`Unknown block id: ${String(blockId)}.`);
    if (shapeId !== undefined && (typeof shapeId !== "number" || !isKnownShapeId(shapeId))) errors.push(`Unknown shape id: ${String(shapeId)}.`);
    if (rotation !== undefined && (typeof rotation !== "number" || !Number.isInteger(rotation) || rotation < 0 || rotation > 3)) errors.push(`Invalid rotation: ${String(rotation)}.`);
    if (state !== undefined && (typeof state !== "number" || !Number.isInteger(state) || state < 0 || state > 255)) errors.push(`Invalid shape state: ${String(state)}.`);
    seen.add(key);
  }
}

function validateZoneAssignments(assignments: unknown, validZoneNumbers: Set<number>, errors: string[]) {
  if (!Array.isArray(assignments)) {
    errors.push("Zone assignments must be an array.");
    return;
  }

  const seen = new Set<string>();
  for (const assignment of assignments) {
    if (!isRecord(assignment) || !isZoneCoordinate(assignment)) {
      errors.push("Every zone assignment must include integer x and z.");
      continue;
    }
    const zoneId = (assignment as Record<string, unknown>).zoneId;
    const key = `${assignment.x},${assignment.z}`;
    if (seen.has(key)) errors.push(`Duplicate zone assignment coordinate: ${key}.`);
    if (typeof zoneId !== "number" || !validZoneNumbers.has(zoneId)) {
      errors.push(`Zone assignment ${key} references unknown numeric zone ${String(zoneId)}.`);
    }
    seen.add(key);
  }
}

function validatePlacedEntities(
  entities: unknown,
  groups: unknown,
  zoneIds: Set<string>,
  markerIds: Set<string>,
  errors: string[],
) {
  if (!Array.isArray(entities)) {
    errors.push("Map entities must be an array.");
    return;
  }

  if (!Array.isArray(groups)) {
    errors.push("Entity groups must be an array.");
    return;
  }

  const groupIds = new Set<string>();
  for (const group of groups) {
    if (!isRecord(group) || !isStableId(group.id)) {
      errors.push(`Invalid entity group id: ${String(isRecord(group) ? group.id : group)}.`);
      continue;
    }
    const groupId = group.id;
    if (groupIds.has(groupId)) errors.push(`Duplicate entity group id: ${groupId}.`);
    groupIds.add(groupId);
  }

  const ids = new Set<string>();
  for (const entity of entities) {
    if (!isRecord(entity)) {
      errors.push("Every map entity must be an object.");
      continue;
    }
    if (!isStableId(entity.id)) errors.push(`Invalid entity id: ${String(entity.id)}.`);
    if (ids.has(entity.id as string)) errors.push(`Duplicate entity id: ${String(entity.id)}.`);
    if (typeof entity.name !== "string" || entity.name.trim().length === 0) errors.push(`Entity ${String(entity.id)} name is required.`);
    if (!ENTITY_TYPES.includes(entity.entityType as never)) errors.push(`Entity ${String(entity.id)} has invalid type.`);
    if (!ENTITY_PRIMITIVE_TYPES.includes(entity.primitiveType as never)) errors.push(`Entity ${String(entity.id)} has invalid primitive.`);
    if (!ENTITY_COLLISION_MODES.includes(entity.collisionMode as never)) errors.push(`Entity ${String(entity.id)} has invalid collision mode.`);
    if (entity.entityType === "prefab") {
      if (typeof entity.prefabId !== "string" || !isStableId(entity.prefabId)) {
        errors.push(`Prefab entity ${String(entity.id)} must include a stable prefab id.`);
      } else {
        const prefab = getPrefabDefinition(entity.prefabId);
        if (!prefab) {
          errors.push(`Prefab entity ${String(entity.id)} references missing prefab ${entity.prefabId}.`);
        } else if (typeof entity.variantId !== "string" || !prefab.variants.some((variant) => variant.id === entity.variantId)) {
          errors.push(`Prefab entity ${String(entity.id)} references missing variant ${String(entity.variantId)}.`);
        } else if (typeof entity.prefabVersion !== "number" || !Number.isInteger(entity.prefabVersion) || entity.prefabVersion < 1) {
          errors.push(`Prefab entity ${String(entity.id)} must include a valid prefab version.`);
        } else if (entity.prefabVersion > prefab.version) {
          errors.push(`Prefab entity ${String(entity.id)} was saved with unsupported newer prefab version ${entity.prefabVersion}.`);
        }
      }
    }
    if (!isSerializableTransform(entity.transform)) errors.push(`Entity ${String(entity.id)} transform is invalid.`);
    if (!isFootprint(entity.footprint)) errors.push(`Entity ${String(entity.id)} footprint is invalid.`);
    if (entity.footprintOverride !== undefined && !isFootprint(entity.footprintOverride)) errors.push(`Entity ${String(entity.id)} footprint override is invalid.`);
    if (entity.collisionModeOverride !== undefined && !ENTITY_COLLISION_MODES.includes(entity.collisionModeOverride as never)) {
      errors.push(`Entity ${String(entity.id)} collision override is invalid.`);
    }
    if (!isRecord(entity.appearance) || typeof entity.appearance.color !== "string" || !/^#[0-9a-f]{6}$/i.test(entity.appearance.color)) {
      errors.push(`Entity ${String(entity.id)} must include a hex colour.`);
    }
    if (typeof entity.zoneId === "string" && !zoneIds.has(entity.zoneId)) errors.push(`Entity ${String(entity.id)} references unknown zone ${entity.zoneId}.`);
    if (typeof entity.markerId === "string" && !markerIds.has(entity.markerId)) errors.push(`Entity ${String(entity.id)} references unknown marker ${entity.markerId}.`);
    if (typeof entity.groupId === "string" && !groupIds.has(entity.groupId)) errors.push(`Entity ${String(entity.id)} references unknown group ${entity.groupId}.`);
    if (!Array.isArray(entity.tags) || !entity.tags.every((tag) => typeof tag === "string")) errors.push(`Entity ${String(entity.id)} tags must be strings.`);
    ids.add(entity.id as string);
  }
}

function validateNavigation(navigation: unknown, zoneIds: Set<string>, errors: string[]) {
  if (!isRecord(navigation)) {
    errors.push("Navigation must be an object.");
    return;
  }

  const nodeTypes: NavigationNodeType[] = ["walk", "route-junction", "wait-point", "look-at", "character-spawn", "bird-perch"];
  const nodes = navigation.nodes;
  const edges = navigation.edges;
  const routes = navigation.routes;
  if (!Array.isArray(nodes) || !Array.isArray(edges) || !Array.isArray(routes)) {
    errors.push("Navigation nodes, edges and routes must be arrays.");
    return;
  }

  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (!isRecord(node) || !isStableId(node.id)) {
      errors.push(`Invalid navigation node id: ${String(isRecord(node) ? node.id : node)}.`);
      continue;
    }
    const nodeId = node.id;
    if (nodeIds.has(nodeId)) errors.push(`Duplicate navigation node id: ${nodeId}.`);
    if (!nodeTypes.includes(node.type as NavigationNodeType)) errors.push(`Navigation node ${nodeId} has invalid type.`);
    if (!isFiniteVector(node.position)) errors.push(`Navigation node ${nodeId} position is invalid.`);
    if (typeof node.zoneId === "string" && !zoneIds.has(node.zoneId)) errors.push(`Navigation node ${nodeId} references unknown zone ${node.zoneId}.`);
    nodeIds.add(nodeId);
  }

  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (!isRecord(edge) || !isStableId(edge.id)) {
      errors.push(`Invalid navigation edge id: ${String(isRecord(edge) ? edge.id : edge)}.`);
      continue;
    }
    const edgeId = edge.id;
    const cost = edge.cost;
    if (edgeIds.has(edgeId)) errors.push(`Duplicate navigation edge id: ${edgeId}.`);
    if (!nodeIds.has(edge.fromNodeId as string)) errors.push(`Navigation edge ${edgeId} references unknown from node ${String(edge.fromNodeId)}.`);
    if (!nodeIds.has(edge.toNodeId as string)) errors.push(`Navigation edge ${edgeId} references unknown to node ${String(edge.toNodeId)}.`);
    if (cost !== undefined && (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0)) errors.push(`Navigation edge ${edgeId} cost is invalid.`);
    edgeIds.add(edgeId);
  }

  const routeIds = new Set<string>();
  for (const route of routes) {
    if (!isRecord(route) || !isStableId(route.id)) {
      errors.push(`Invalid navigation route id: ${String(isRecord(route) ? route.id : route)}.`);
      continue;
    }
    const routeId = route.id;
    if (routeIds.has(routeId)) errors.push(`Duplicate navigation route id: ${routeId}.`);
    if (!Array.isArray(route.nodeIds)) {
      errors.push(`Navigation route ${routeId} node ids must be an array.`);
    } else {
      for (const nodeId of route.nodeIds) {
        if (!nodeIds.has(nodeId as string)) errors.push(`Navigation route ${routeId} references unknown node ${String(nodeId)}.`);
      }
    }
    routeIds.add(routeId);
  }
}

function isSerializableTransform(value: unknown) {
  if (!isRecord(value)) return false;
  return isFiniteVector(value.position) && isFiniteVector(value.rotation) && isFiniteVector(value.scale);
}

function isFiniteVector(value: unknown) {
  if (!isRecord(value)) return false;
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function isFootprint(value: unknown) {
  if (!isRecord(value)) return false;
  return typeof value.width === "number" && Number.isFinite(value.width) && value.width > 0 &&
    typeof value.depth === "number" && Number.isFinite(value.depth) && value.depth > 0 &&
    typeof value.height === "number" && Number.isFinite(value.height) && value.height > 0;
}

function isZoneFocusDirection(value: unknown): value is MapZoneFocusDirection {
  return typeof value === "string" && ["north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest"].includes(value);
}

function hasExpectedDimensions(map: MapDefinition) {
  return (
    map.dimensions?.width === WORLD_CONFIG.width &&
    map.dimensions.minY === WORLD_CONFIG.minY &&
    map.dimensions.height === WORLD_CONFIG.height &&
    map.dimensions.depth === WORLD_CONFIG.depth &&
    map.blockSize === WORLD_CONFIG.blockSize
  );
}

function cloneZone(zone: MapZoneDefinition): MapZoneDefinition {
  return { ...zone };
}

function cloneMarker(marker: MapMarkerDefinition): MapMarkerDefinition {
  return {
    ...marker,
    gridPosition: { ...marker.gridPosition },
    offset: marker.offset ? { ...marker.offset } : undefined,
    contentReference: marker.contentReference ? { ...marker.contentReference } : undefined,
  };
}

function cloneSpawnPoint(spawn: MapSpawnPoint): MapSpawnPoint {
  return {
    ...spawn,
    position: { ...spawn.position },
    cameraTarget: spawn.cameraTarget ? { ...spawn.cameraTarget } : undefined,
  };
}

function cloneCameraPreset(preset: MapCameraPreset): MapCameraPreset {
  return {
    ...preset,
    cameraPosition: { ...preset.cameraPosition },
    controlsTarget: { ...preset.controlsTarget },
  };
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isGridCoordinate(value: unknown): value is GridCoordinate {
  if (!isRecord(value)) return false;
  const x = value.x;
  const y = value.y;
  const z = value.z;
  return (
    typeof x === "number" &&
    typeof y === "number" &&
    typeof z === "number" &&
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    Number.isInteger(z) &&
    x >= 0 &&
    x < WORLD_CONFIG.width &&
    y >= WORLD_CONFIG.minY &&
    y <= WORLD_CONFIG.minY + WORLD_CONFIG.height - 1 &&
    z >= 0 &&
    z < WORLD_CONFIG.depth
  );
}

function isZoneCoordinate(value: unknown): value is MapZoneAssignment {
  if (!isRecord(value)) return false;
  const x = value.x;
  const y = value.y;
  const z = value.z;
  return (
    typeof x === "number" &&
    typeof z === "number" &&
    (y === undefined || (typeof y === "number" && Number.isInteger(y) && y >= WORLD_CONFIG.minY && y <= WORLD_CONFIG.minY + WORLD_CONFIG.height - 1)) &&
    Number.isInteger(x) &&
    Number.isInteger(z) &&
    x >= 0 &&
    x < WORLD_CONFIG.width &&
    z >= 0 &&
    z < WORLD_CONFIG.depth
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
