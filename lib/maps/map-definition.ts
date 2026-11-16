import { type BlockId, isKnownBlockId } from "@/lib/world/block-registry";
import { createFlatVoxelWorld, VoxelWorld } from "@/lib/world/voxel-world";
import { WORLD_CONFIG, type GridCoordinate, type WorldConfig } from "@/lib/world/world-config";
import {
  DEFAULT_ROTATION,
  DEFAULT_SHAPE_ID,
  DEFAULT_STATE,
  isKnownShapeId,
  normalizeRotation,
  normalizeShapeId,
  normalizeState,
  type CellRotation,
  type ShapeId,
} from "@/lib/voxel-shapes/shape-ids";
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

/**
 * Map file format, version 5.
 *
 * v5 changes over v4:
 * - arbitrary horizontal dimensions (multiples of the chunk size) instead of a fixed 64 x 64;
 * - `playableBounds`: the area a visitor can reach. Everything outside is backdrop scenery;
 * - zones can reference portfolio content or declare a mini-game;
 * - `environment` (time of day, wind) replaces nothing but is required from now on;
 * - the fluid layer, `runtimeMode` and `blockSize` are gone.
 *
 * Older files (v1-v4) are upgraded by `migrateMapDefinition`.
 */
export const MAP_DEFINITION_SCHEMA_VERSION = 5;

export type MapKind = "portfolio" | "interior" | "minigame" | "test" | "custom";
export type MapContentType = "project" | "about" | "experience" | "skillGroup" | "contact";

export type MapBlockEdit = GridCoordinate & {
  blockId: BlockId;
  shapeId?: ShapeId;
  rotation?: CellRotation;
  state?: number;
};

export type MapZoneAssignment = Pick<GridCoordinate, "x" | "z"> & {
  y?: number;
  zoneId: number;
};

export type SerializedBlockData = {
  encoding: "flat-edits-v1" | "cell-edits-v2";
  generator: "flat-v1";
  edits: MapBlockEdit[];
};

export type MapDimensions = {
  width: number;
  depth: number;
  minY: number;
  height: number;
};

/** Inclusive cell bounds on the horizontal plane. */
export type MapBounds = {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
};

export type MapZoneFocusDirection = "north" | "south" | "east" | "west" | "northeast" | "northwest" | "southeast" | "southwest";

export type MapContentReference = {
  contentType: MapContentType;
  contentId: string;
};

export type MapMinigameConfig = {
  gameId: string;
  settings?: Record<string, string | number | boolean>;
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
  /** "area" zones are plain regions; "minigame" zones stay voxel-based in production. */
  kind?: "area" | "minigame";
  contentReference?: MapContentReference;
  minigame?: MapMinigameConfig;
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

export type MapEnvironment = {
  /** Hours, 0-24. */
  timeOfDay: number;
  wind: {
    /** Compass degrees the wind blows towards, 0 = north (-Z). */
    direction: number;
    /** 0 (still) to 1 (storm). */
    strength: number;
  };
};

export type MapDefinition = {
  schemaVersion: 5;
  id: string;
  name: string;
  description?: string;
  kind: MapKind;
  dimensions: MapDimensions;
  playableBounds: MapBounds;
  blocks: SerializedBlockData;
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
  environment: MapEnvironment;
  metadata: {
    createdAt?: string;
    updatedAt?: string;
    authoringVersion?: string;
  };
};

export type MapDefinitionValidationResult =
  | { ok: true; map: MapDefinition }
  | { ok: false; errors: string[] };

export type MapValidationOptions = {
  /** When provided, content references that do not resolve are reported as errors. */
  hasContent?: (reference: MapContentReference) => boolean;
};

export type LoadedMapState = {
  definition: MapDefinition;
  world: VoxelWorld;
};

export const DEFAULT_MAP_ENVIRONMENT: MapEnvironment = {
  timeOfDay: 14,
  wind: { direction: 90, strength: 0.25 },
};

export function getMapWorldConfig(map: Pick<MapDefinition, "dimensions">): WorldConfig {
  return {
    width: map.dimensions.width,
    depth: map.dimensions.depth,
    minY: map.dimensions.minY,
    height: map.dimensions.height,
    blockSize: WORLD_CONFIG.blockSize,
    chunkSize: WORLD_CONFIG.chunkSize,
  };
}

export function getFullMapBounds(dimensions: Pick<MapDimensions, "width" | "depth">): MapBounds {
  return { minX: 0, minZ: 0, maxX: dimensions.width - 1, maxZ: dimensions.depth - 1 };
}

export function isInsidePlayableBounds(map: Pick<MapDefinition, "playableBounds">, x: number, z: number) {
  const bounds = map.playableBounds;
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

/** Diffs a world against the flat generator baseline. Cost is one pass over the world; call on save, not per edit. */
export function serializeWorldEdits(world: VoxelWorld): { edits: MapBlockEdit[]; zoneAssignments: MapZoneAssignment[] } {
  const baseWorld = createFlatVoxelWorld(world.config);
  const edits: MapBlockEdit[] = [];
  const zoneAssignments: MapZoneAssignment[] = [];

  for (let index = 0; index < world.blocks.length; index += 1) {
    const blockId = world.blocks[index] as BlockId;
    const shapeId = normalizeShapeId(world.shapes[index]);
    const rotation = normalizeRotation(world.rotations[index]);
    const state = normalizeState(world.states[index]);
    const hasShapeData = shapeId !== DEFAULT_SHAPE_ID || rotation !== DEFAULT_ROTATION || state !== DEFAULT_STATE;
    if (blockId === baseWorld.blocks[index] && !hasShapeData) continue;
    const coordinates = world.getCoordinates(index);
    if (!coordinates) continue;
    edits.push({
      ...coordinates,
      blockId,
      ...(shapeId !== DEFAULT_SHAPE_ID ? { shapeId } : {}),
      ...(rotation !== DEFAULT_ROTATION ? { rotation } : {}),
      ...(state !== DEFAULT_STATE ? { state } : {}),
    });
  }

  for (let index = 0; index < world.zones.length; index += 1) {
    const zoneId = world.zones[index];
    if (zoneId === 0) continue;
    const coordinates = world.getZoneCoordinates(index);
    if (coordinates) zoneAssignments.push({ ...coordinates, zoneId });
  }

  // getCoordinates/getZoneCoordinates walk in storage order (y, z, x), which is already the canonical sort.
  return { edits, zoneAssignments };
}

export function createMapDefinitionFromWorld(input: {
  id: string;
  name: string;
  description?: string;
  kind: MapKind;
  world: VoxelWorld;
  playableBounds?: MapBounds;
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
  environment?: MapEnvironment;
  metadata?: MapDefinition["metadata"];
}): MapDefinition {
  const { edits, zoneAssignments } = serializeWorldEdits(input.world);
  const dimensions: MapDimensions = {
    width: input.world.config.width,
    depth: input.world.config.depth,
    minY: input.world.config.minY,
    height: input.world.config.height,
  };

  return {
    schemaVersion: MAP_DEFINITION_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    description: input.description,
    kind: input.kind,
    dimensions,
    playableBounds: input.playableBounds ? { ...input.playableBounds } : getFullMapBounds(dimensions),
    blocks: { encoding: "cell-edits-v2", generator: "flat-v1", edits },
    zoneAssignments,
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
    environment: cloneEnvironment(input.environment ?? DEFAULT_MAP_ENVIRONMENT),
    metadata: { ...input.metadata },
  };
}

export function createBlankMapDefinition(input: {
  id: string;
  name: string;
  kind?: MapKind;
  width?: number;
  depth?: number;
}): MapDefinition {
  const config: WorldConfig = {
    ...WORLD_CONFIG,
    width: input.width ?? WORLD_CONFIG.width,
    depth: input.depth ?? WORLD_CONFIG.depth,
  };
  const center = { x: Math.floor(config.width / 2) - 1, z: Math.floor(config.depth / 2) - 1 };
  const now = new Date().toISOString();

  return createMapDefinitionFromWorld({
    id: input.id,
    name: input.name,
    kind: input.kind ?? "custom",
    world: createFlatVoxelWorld(config),
    zones: [],
    markers: [],
    spawnPoints: [{
      id: "overview",
      label: "Overview",
      position: { x: center.x, y: 1, z: center.z },
      rotationY: 0,
      cameraTarget: { x: center.x, y: 0, z: center.z },
    }],
    cameraPresets: [createDefaultOverviewCameraPreset()],
    defaultSpawnId: "overview",
    defaultCameraPresetId: "overview",
    metadata: { createdAt: now, updatedAt: now },
  });
}

export function cloneMapDefinition(map: MapDefinition): MapDefinition {
  return {
    ...map,
    dimensions: { ...map.dimensions },
    playableBounds: { ...map.playableBounds },
    blocks: { ...map.blocks, edits: map.blocks.edits.map((edit) => ({ ...edit })) },
    zoneAssignments: map.zoneAssignments.map((zone) => ({ ...zone })),
    zones: map.zones.map(cloneZone),
    markers: map.markers.map(cloneMarker),
    entities: map.entities.map(clonePlacedEntity),
    entityGroups: map.entityGroups.map(cloneEntityGroup),
    navigation: cloneNavigationDefinition(map.navigation),
    spawnPoints: map.spawnPoints.map(cloneSpawnPoint),
    cameraPresets: map.cameraPresets.map(cloneCameraPreset),
    presentation: { ...map.presentation },
    environment: cloneEnvironment(map.environment),
    metadata: { ...map.metadata },
  };
}

export function duplicateMapDefinition(map: MapDefinition, id: string, name: string): MapDefinition {
  const copy = cloneMapDefinition(map);
  const now = new Date().toISOString();
  return { ...copy, id, name, metadata: { ...copy.metadata, createdAt: now, updatedAt: now } };
}

/** Builds the voxel world a map describes. Throws when the map is invalid. */
export function createLoadedMapState(map: MapDefinition): LoadedMapState {
  const validation = validateMapDefinition(map);
  if (!validation.ok) {
    throw new Error(validation.errors.join("\n"));
  }

  const definition = validation.map;
  const world = createFlatVoxelWorld(getMapWorldConfig(definition));
  for (const edit of definition.blocks.edits) {
    world.setCell({
      x: edit.x,
      y: edit.y,
      z: edit.z,
      blockId: edit.blockId,
      shapeId: edit.shapeId ?? DEFAULT_SHAPE_ID,
      rotation: edit.rotation ?? DEFAULT_ROTATION,
      state: edit.state ?? DEFAULT_STATE,
      zoneId: 0,
    });
  }
  for (const zone of definition.zoneAssignments) {
    world.setColumnZone(zone.x, zone.z, zone.zoneId);
  }
  world.clearDirtyChunks();
  world.clearDirtyZoneChunks();

  return { definition, world };
}

/**
 * Upgrades any supported map file to the current schema. Accepts raw parsed JSON.
 * Throws for files that are not map definitions or come from a newer version.
 */
export function migrateMapDefinition(input: unknown): MapDefinition {
  if (!isRecord(input)) {
    throw new Error("Map definition must be an object.");
  }
  const version = input.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new Error(`Map definition has an invalid schema version: ${String(version)}.`);
  }
  if (version > MAP_DEFINITION_SCHEMA_VERSION) {
    throw new Error(`Map schema version ${version} is newer than this build supports (${MAP_DEFINITION_SCHEMA_VERSION}).`);
  }

  const source = input as Partial<MapDefinition> & Record<string, unknown>;
  const sourceDimensions: Record<string, unknown> = isRecord(source.dimensions) ? source.dimensions : {};
  const dimensions: MapDimensions = {
    width: typeof sourceDimensions.width === "number" ? sourceDimensions.width : WORLD_CONFIG.width,
    depth: typeof sourceDimensions.depth === "number" ? sourceDimensions.depth : WORLD_CONFIG.depth,
    // v1-v3 files predate the taller world; their cells keep their coordinates inside the current vertical range.
    minY: WORLD_CONFIG.minY,
    height: WORLD_CONFIG.height,
  };
  const navigation: Record<string, unknown> = isRecord(source.navigation) ? source.navigation : {};

  // Explicit field list: dropped v4 fields (fluids, runtimeMode, blockSize) must not survive the upgrade.
  return {
    schemaVersion: MAP_DEFINITION_SCHEMA_VERSION,
    id: source.id as string,
    name: source.name as string,
    description: source.description,
    kind: (source.kind as MapKind) ?? "custom",
    dimensions,
    playableBounds: isRecord(source.playableBounds)
      ? { ...(source.playableBounds as MapBounds) }
      : getFullMapBounds(dimensions),
    blocks: isRecord(source.blocks)
      ? { ...(source.blocks as SerializedBlockData) }
      : { encoding: "cell-edits-v2", generator: "flat-v1", edits: [] },
    zoneAssignments: Array.isArray(source.zoneAssignments) ? source.zoneAssignments : [],
    zones: Array.isArray(source.zones) ? source.zones : [],
    markers: Array.isArray(source.markers) ? source.markers : [],
    entities: Array.isArray(source.entities) ? source.entities : [],
    entityGroups: Array.isArray(source.entityGroups) ? source.entityGroups : [],
    navigation: {
      nodes: Array.isArray(navigation.nodes) ? navigation.nodes : [],
      edges: Array.isArray(navigation.edges) ? navigation.edges : [],
      routes: Array.isArray(navigation.routes) ? navigation.routes : [],
    },
    spawnPoints: Array.isArray(source.spawnPoints) ? source.spawnPoints : [],
    cameraPresets: Array.isArray(source.cameraPresets) ? source.cameraPresets : [],
    defaultSpawnId: source.defaultSpawnId,
    defaultCameraPresetId: source.defaultCameraPresetId,
    presentation: isRecord(source.presentation)
      ? { ...(source.presentation as MapPresentationConfig) }
      : { legendVisible: true },
    environment: isRecord(source.environment)
      ? cloneEnvironment(source.environment as MapEnvironment)
      : cloneEnvironment(DEFAULT_MAP_ENVIRONMENT),
    metadata: isRecord(source.metadata) ? { ...(source.metadata as MapDefinition["metadata"]) } : {},
  };
}

/**
 * Grows a map by a margin of flat cells on each side and keeps the previous
 * extent as the playable area, so the new margin becomes backdrop scenery.
 * Margins must be multiples of the chunk size.
 */
export function expandMapWithBackdrop(
  map: MapDefinition,
  margin: { west: number; east: number; north: number; south: number },
): MapDefinition {
  for (const [side, value] of Object.entries(margin)) {
    if (!Number.isInteger(value) || value < 0 || value % WORLD_CONFIG.chunkSize !== 0) {
      throw new RangeError(`Backdrop margin ${side} must be a non-negative multiple of ${WORLD_CONFIG.chunkSize}.`);
    }
  }

  const copy = cloneMapDefinition(map);
  const dx = margin.west;
  const dz = margin.north;
  // World space is centred on the map, so an asymmetric margin moves the centre.
  const worldDx = (margin.west - margin.east) / 2;
  const worldDz = (margin.north - margin.south) / 2;
  const shiftGrid = <T extends { x: number; z: number }>(value: T): T => ({ ...value, x: value.x + dx, z: value.z + dz });
  const shiftWorld = <T extends { x: number; z: number }>(value: T): T => ({ ...value, x: value.x + worldDx, z: value.z + worldDz });

  // The flat generator marks the four centre cells of a world. After growing,
  // the old centre must be written explicitly unless an edit already covers it.
  const oldBase = createFlatVoxelWorld(getMapWorldConfig(map));
  const dimensions: MapDimensions = {
    ...copy.dimensions,
    width: copy.dimensions.width + margin.west + margin.east,
    depth: copy.dimensions.depth + margin.north + margin.south,
  };
  const newBase = createFlatVoxelWorld(getMapWorldConfig({ dimensions }));
  const edits = copy.blocks.edits.map(shiftGrid);
  const edited = new Set(edits.map((edit) => `${edit.x},${edit.y},${edit.z}`));
  const reconcile = (x: number, z: number, blockId: BlockId) => {
    if (edited.has(`${x},0,${z}`) || newBase.getBlock(x, 0, z) === blockId) return;
    edits.push({ x, y: 0, z, blockId });
  };
  for (const offsetZ of [-1, 0]) {
    for (const offsetX of [-1, 0]) {
      const oldX = map.dimensions.width / 2 + offsetX;
      const oldZ = map.dimensions.depth / 2 + offsetZ;
      reconcile(oldX + dx, oldZ + dz, oldBase.getBlock(oldX, 0, oldZ));
      const newX = dimensions.width / 2 + offsetX;
      const newZ = dimensions.depth / 2 + offsetZ;
      const insideOld = newX - dx >= 0 && newX - dx < map.dimensions.width && newZ - dz >= 0 && newZ - dz < map.dimensions.depth;
      reconcile(newX, newZ, insideOld ? oldBase.getBlock(newX - dx, 0, newZ - dz) : oldBase.getBlock(0, 0, 0));
    }
  }
  edits.sort((left, right) => left.y - right.y || left.z - right.z || left.x - right.x);

  return {
    ...copy,
    dimensions,
    playableBounds: {
      minX: map.playableBounds.minX + dx,
      minZ: map.playableBounds.minZ + dz,
      maxX: map.playableBounds.maxX + dx,
      maxZ: map.playableBounds.maxZ + dz,
    },
    blocks: { ...copy.blocks, edits },
    zoneAssignments: copy.zoneAssignments.map(shiftGrid),
    markers: copy.markers.map((marker) => ({ ...marker, gridPosition: shiftGrid(marker.gridPosition) })),
    entities: copy.entities.map((entity) => ({
      ...entity,
      transform: { ...entity.transform, position: shiftWorld(entity.transform.position) },
    })),
    navigation: {
      ...copy.navigation,
      nodes: copy.navigation.nodes.map((node) => ({ ...node, position: shiftWorld(node.position) })),
    },
    spawnPoints: copy.spawnPoints.map((spawn) => ({
      ...spawn,
      position: shiftGrid(spawn.position),
      cameraTarget: spawn.cameraTarget ? shiftGrid(spawn.cameraTarget) : undefined,
    })),
    cameraPresets: copy.cameraPresets.map((preset) => ({
      ...preset,
      cameraPosition: shiftWorld(preset.cameraPosition),
      controlsTarget: shiftWorld(preset.controlsTarget),
    })),
  };
}

export function validateMapDefinition(input: unknown, options: MapValidationOptions = {}): MapDefinitionValidationResult {
  let map: MapDefinition;
  try {
    map = migrateMapDefinition(input);
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }

  const errors: string[] = [];
  if (!isStableId(map.id)) errors.push("Map id must be a stable lowercase id.");
  if (typeof map.name !== "string" || map.name.trim().length === 0) errors.push("Map name is required.");
  if (!["portfolio", "interior", "minigame", "test", "custom"].includes(map.kind)) {
    errors.push(`Unknown map kind: ${String(map.kind)}.`);
  }

  const dimensionError = getDimensionError(map.dimensions);
  if (dimensionError) {
    // Every later check depends on valid dimensions.
    return { ok: false, errors: [...errors, dimensionError] };
  }
  const dimensions = map.dimensions;
  const isCell = (value: unknown): value is GridCoordinate => isGridCoordinate(value, dimensions);

  const bounds = map.playableBounds;
  if (
    !isRecord(bounds) ||
    ![bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ].every(Number.isInteger) ||
    bounds.minX < 0 || bounds.minZ < 0 || bounds.maxX >= dimensions.width || bounds.maxZ >= dimensions.depth ||
    bounds.minX > bounds.maxX || bounds.minZ > bounds.maxZ
  ) {
    errors.push("Playable bounds must be a non-empty cell rectangle inside the map.");
  }

  if (
    !isRecord(map.blocks) ||
    (map.blocks.encoding !== "flat-edits-v1" && map.blocks.encoding !== "cell-edits-v2") ||
    map.blocks.generator !== "flat-v1"
  ) {
    errors.push("Map blocks must use flat-edits-v1 or cell-edits-v2 storage.");
  } else {
    validateBlockEdits(map.blocks.edits, isCell, errors);
  }

  const checkContent = (owner: string, reference: unknown) => {
    if (reference === undefined) return;
    if (!isRecord(reference) || typeof reference.contentType !== "string" || typeof reference.contentId !== "string") {
      errors.push(`${owner} has a malformed content reference.`);
      return;
    }
    if (options.hasContent && !options.hasContent(reference as MapContentReference)) {
      errors.push(`${owner} references missing content ${reference.contentType}:${reference.contentId}.`);
    }
  };

  const zoneIds = new Set<string>();
  const zoneNumericIds = new Set<number>();
  for (const zone of map.zones) {
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
    if (zone.kind !== undefined && zone.kind !== "area" && zone.kind !== "minigame") {
      errors.push(`Zone ${zone.id} has invalid kind: ${String(zone.kind)}.`);
    }
    if (zone.kind === "minigame" && (!isRecord(zone.minigame) || !isStableId(zone.minigame.gameId))) {
      errors.push(`Mini-game zone ${zone.id} must name a game id.`);
    }
    checkContent(`Zone ${zone.id}`, zone.contentReference);
    zoneIds.add(zone.id);
    zoneNumericIds.add(zone.numericId);
  }

  const markerIds = new Set<string>();
  for (const marker of map.markers) {
    if (!isStableId(marker.id)) errors.push(`Invalid marker id: ${String(marker.id)}.`);
    if (markerIds.has(marker.id)) errors.push(`Duplicate marker id: ${marker.id}.`);
    if (marker.zoneId && !zoneIds.has(marker.zoneId)) errors.push(`Marker ${marker.id} references unknown zone ${marker.zoneId}.`);
    if (!isCell(marker.gridPosition)) errors.push(`Marker ${marker.id} position is invalid.`);
    if (marker.focusCameraPresetId && !map.cameraPresets.some((preset) => preset.id === marker.focusCameraPresetId)) {
      errors.push(`Marker ${marker.id} references unknown camera preset ${marker.focusCameraPresetId}.`);
    }
    checkContent(`Marker ${marker.id}`, marker.contentReference);
    markerIds.add(marker.id);
  }

  validatePlacedEntities(map.entities, map.entityGroups, zoneIds, markerIds, checkContent, errors);
  validateNavigation(map.navigation, zoneIds, errors);

  const spawnIds = new Set<string>();
  for (const spawn of map.spawnPoints) {
    if (!isStableId(spawn.id)) errors.push(`Invalid spawn id: ${String(spawn.id)}.`);
    if (spawnIds.has(spawn.id)) errors.push(`Duplicate spawn id: ${spawn.id}.`);
    if (!isCell(spawn.position)) errors.push(`Spawn ${spawn.id} position is invalid.`);
    spawnIds.add(spawn.id);
  }

  const cameraIds = new Set<string>();
  for (const preset of map.cameraPresets) {
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

  validateZoneAssignments(map.zoneAssignments, zoneNumericIds, dimensions, errors);

  const environment = map.environment;
  if (
    !isRecord(environment) || !isRecord(environment.wind) ||
    !isFiniteInRange(environment.timeOfDay, 0, 24) ||
    !isFiniteInRange(environment.wind.direction, 0, 360) ||
    !isFiniteInRange(environment.wind.strength, 0, 1)
  ) {
    errors.push("Environment must define timeOfDay (0-24) and wind direction (0-360) and strength (0-1).");
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, map: cloneMapDefinition(map) };
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

function getDimensionError(dimensions: unknown): string | null {
  if (!isRecord(dimensions)) return "Map dimensions are required.";
  const { width, depth, minY, height } = dimensions;
  const chunk = WORLD_CONFIG.chunkSize;
  if (![width, depth, minY, height].every(Number.isInteger)) return "Map dimensions must be integers.";
  if ((width as number) < chunk || (depth as number) < chunk || (width as number) % chunk !== 0 || (depth as number) % chunk !== 0) {
    return `Map width and depth must be positive multiples of ${chunk}.`;
  }
  if ((width as number) > 512 || (depth as number) > 512) return "Map width and depth must not exceed 512.";
  if (minY !== WORLD_CONFIG.minY || height !== WORLD_CONFIG.height) {
    return `Map vertical range must be ${WORLD_CONFIG.height} cells from Y=${WORLD_CONFIG.minY}.`;
  }
  return null;
}

function validateBlockEdits(edits: unknown, isCell: (value: unknown) => value is GridCoordinate, errors: string[]) {
  if (!Array.isArray(edits)) {
    errors.push("Block edits must be an array.");
    return;
  }

  const seen = new Set<string>();
  for (const edit of edits) {
    if (!isCell(edit)) {
      errors.push("Every block edit must include integer x, y and z inside the map.");
      continue;
    }
    const { blockId, shapeId, rotation, state } = edit as unknown as Record<string, unknown>;
    const key = `${edit.x},${edit.y},${edit.z}`;
    if (seen.has(key)) errors.push(`Duplicate block edit coordinate: ${key}.`);
    if (typeof blockId !== "number" || !isKnownBlockId(blockId)) errors.push(`Unknown block id: ${String(blockId)}.`);
    if (shapeId !== undefined && (typeof shapeId !== "number" || !isKnownShapeId(shapeId))) errors.push(`Unknown shape id: ${String(shapeId)}.`);
    if (rotation !== undefined && (typeof rotation !== "number" || !Number.isInteger(rotation) || rotation < 0 || rotation > 3)) errors.push(`Invalid rotation: ${String(rotation)}.`);
    if (state !== undefined && (typeof state !== "number" || !Number.isInteger(state) || state < 0 || state > 255)) errors.push(`Invalid shape state: ${String(state)}.`);
    seen.add(key);
  }
}

function validateZoneAssignments(assignments: unknown, validZoneNumbers: Set<number>, dimensions: MapDimensions, errors: string[]) {
  if (!Array.isArray(assignments)) {
    errors.push("Zone assignments must be an array.");
    return;
  }

  const seen = new Set<string>();
  for (const assignment of assignments) {
    if (
      !isRecord(assignment) || !Number.isInteger(assignment.x) || !Number.isInteger(assignment.z) ||
      (assignment.x as number) < 0 || (assignment.x as number) >= dimensions.width ||
      (assignment.z as number) < 0 || (assignment.z as number) >= dimensions.depth
    ) {
      errors.push("Every zone assignment must include integer x and z inside the map.");
      continue;
    }
    const key = `${assignment.x},${assignment.z}`;
    if (seen.has(key)) errors.push(`Duplicate zone assignment coordinate: ${key}.`);
    if (typeof assignment.zoneId !== "number" || !validZoneNumbers.has(assignment.zoneId)) {
      errors.push(`Zone assignment ${key} references unknown numeric zone ${String(assignment.zoneId)}.`);
    }
    seen.add(key);
  }
}

function validatePlacedEntities(
  entities: unknown,
  groups: unknown,
  zoneIds: Set<string>,
  markerIds: Set<string>,
  checkContent: (owner: string, reference: unknown) => void,
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
    if (groupIds.has(group.id)) errors.push(`Duplicate entity group id: ${group.id}.`);
    groupIds.add(group.id);
  }

  const ids = new Set<string>();
  for (const entity of entities) {
    if (!isRecord(entity)) {
      errors.push("Every map entity must be an object.");
      continue;
    }
    const label = `Entity ${String(entity.id)}`;
    if (!isStableId(entity.id)) errors.push(`Invalid entity id: ${String(entity.id)}.`);
    if (ids.has(entity.id as string)) errors.push(`Duplicate entity id: ${String(entity.id)}.`);
    if (typeof entity.name !== "string" || entity.name.trim().length === 0) errors.push(`${label} name is required.`);
    if (!ENTITY_TYPES.includes(entity.entityType as never)) errors.push(`${label} has invalid type.`);
    if (!ENTITY_PRIMITIVE_TYPES.includes(entity.primitiveType as never)) errors.push(`${label} has invalid primitive.`);
    if (!ENTITY_COLLISION_MODES.includes(entity.collisionMode as never)) errors.push(`${label} has invalid collision mode.`);
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
    if (entity.entityType === "model" && (typeof entity.assetReference !== "string" || !isStableId(entity.assetReference))) {
      errors.push(`Model entity ${String(entity.id)} must name its model in assetReference.`);
    }
    if (!isSerializableTransform(entity.transform)) errors.push(`${label} transform is invalid.`);
    if (!isFootprint(entity.footprint)) errors.push(`${label} footprint is invalid.`);
    if (entity.footprintOverride !== undefined && !isFootprint(entity.footprintOverride)) errors.push(`${label} footprint override is invalid.`);
    if (entity.collisionModeOverride !== undefined && !ENTITY_COLLISION_MODES.includes(entity.collisionModeOverride as never)) {
      errors.push(`${label} collision override is invalid.`);
    }
    if (!isRecord(entity.appearance) || typeof entity.appearance.color !== "string" || !/^#[0-9a-f]{6}$/i.test(entity.appearance.color)) {
      errors.push(`${label} must include a hex colour.`);
    }
    if (typeof entity.zoneId === "string" && !zoneIds.has(entity.zoneId)) errors.push(`${label} references unknown zone ${entity.zoneId}.`);
    if (typeof entity.markerId === "string" && !markerIds.has(entity.markerId)) errors.push(`${label} references unknown marker ${entity.markerId}.`);
    if (typeof entity.groupId === "string" && !groupIds.has(entity.groupId)) errors.push(`${label} references unknown group ${entity.groupId}.`);
    if (!Array.isArray(entity.tags) || !entity.tags.every((tag) => typeof tag === "string")) errors.push(`${label} tags must be strings.`);
    checkContent(label, entity.contentReference);
    ids.add(entity.id as string);
  }
}

function validateNavigation(navigation: unknown, zoneIds: Set<string>, errors: string[]) {
  if (!isRecord(navigation)) {
    errors.push("Navigation must be an object.");
    return;
  }

  const nodeTypes: NavigationNodeType[] = ["walk", "route-junction", "wait-point", "look-at", "character-spawn", "bird-perch"];
  const { nodes, edges, routes } = navigation;
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
    if (nodeIds.has(node.id)) errors.push(`Duplicate navigation node id: ${node.id}.`);
    if (!nodeTypes.includes(node.type as NavigationNodeType)) errors.push(`Navigation node ${node.id} has invalid type.`);
    if (!isFiniteVector(node.position)) errors.push(`Navigation node ${node.id} position is invalid.`);
    if (typeof node.zoneId === "string" && !zoneIds.has(node.zoneId)) errors.push(`Navigation node ${node.id} references unknown zone ${node.zoneId}.`);
    nodeIds.add(node.id);
  }

  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (!isRecord(edge) || !isStableId(edge.id)) {
      errors.push(`Invalid navigation edge id: ${String(isRecord(edge) ? edge.id : edge)}.`);
      continue;
    }
    const cost = edge.cost;
    if (edgeIds.has(edge.id)) errors.push(`Duplicate navigation edge id: ${edge.id}.`);
    if (!nodeIds.has(edge.fromNodeId as string)) errors.push(`Navigation edge ${edge.id} references unknown from node ${String(edge.fromNodeId)}.`);
    if (!nodeIds.has(edge.toNodeId as string)) errors.push(`Navigation edge ${edge.id} references unknown to node ${String(edge.toNodeId)}.`);
    if (cost !== undefined && (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0)) errors.push(`Navigation edge ${edge.id} cost is invalid.`);
    edgeIds.add(edge.id);
  }

  const routeIds = new Set<string>();
  for (const route of routes) {
    if (!isRecord(route) || !isStableId(route.id)) {
      errors.push(`Invalid navigation route id: ${String(isRecord(route) ? route.id : route)}.`);
      continue;
    }
    if (routeIds.has(route.id)) errors.push(`Duplicate navigation route id: ${route.id}.`);
    if (!Array.isArray(route.nodeIds)) {
      errors.push(`Navigation route ${route.id} node ids must be an array.`);
    } else {
      for (const nodeId of route.nodeIds) {
        if (!nodeIds.has(nodeId as string)) errors.push(`Navigation route ${route.id} references unknown node ${String(nodeId)}.`);
      }
    }
    routeIds.add(route.id);
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

function isFiniteInRange(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isFootprint(value: unknown) {
  if (!isRecord(value)) return false;
  return [value.width, value.depth, value.height].every((side) => typeof side === "number" && Number.isFinite(side) && side > 0);
}

function isZoneFocusDirection(value: unknown): value is MapZoneFocusDirection {
  return typeof value === "string" && ["north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest"].includes(value);
}

function cloneZone(zone: MapZoneDefinition): MapZoneDefinition {
  return {
    ...zone,
    contentReference: zone.contentReference ? { ...zone.contentReference } : undefined,
    minigame: zone.minigame ? { ...zone.minigame, settings: zone.minigame.settings ? { ...zone.minigame.settings } : undefined } : undefined,
  };
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

function cloneEnvironment(environment: MapEnvironment): MapEnvironment {
  return { timeOfDay: environment.timeOfDay, wind: { ...environment.wind } };
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isGridCoordinate(value: unknown, dimensions: MapDimensions): value is GridCoordinate {
  if (!isRecord(value)) return false;
  const { x, y, z } = value;
  return (
    Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) &&
    (x as number) >= 0 && (x as number) < dimensions.width &&
    (y as number) >= dimensions.minY && (y as number) <= dimensions.minY + dimensions.height - 1 &&
    (z as number) >= 0 && (z as number) < dimensions.depth
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Stable, diff-friendly file encoding: pretty-printed, but with one block edit
 * or zone assignment per line so a small terrain change is a small diff.
 */
export function serializeMapDefinition(map: MapDefinition): string {
  const EDITS = "__MAP_EDITS__";
  const ZONES = "__MAP_ZONE_ASSIGNMENTS__";
  const rows = (items: unknown[], indent: string) =>
    items.length === 0 ? "[]" : `[\n${items.map((item) => `${indent}  ${JSON.stringify(item)}`).join(",\n")}\n${indent}]`;
  const body = JSON.stringify({ ...map, blocks: { ...map.blocks, edits: EDITS }, zoneAssignments: ZONES }, null, 2);
  return `${body
    .replace(`"${EDITS}"`, () => rows(map.blocks.edits, "    "))
    .replace(`"${ZONES}"`, () => rows(map.zoneAssignments, "  "))}\n`;
}
