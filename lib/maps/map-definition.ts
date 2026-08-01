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

export const MAP_DEFINITION_SCHEMA_VERSION = 1;

export type MapRuntimeMode = "baked-static" | "dynamic-voxel";
export type MapKind = "portfolio" | "interior" | "minigame" | "test" | "custom";
export type MapContentType = "project" | "about" | "experience" | "skillGroup" | "contact";
export type MapEntityType = "point-of-interest" | "spawn-point" | "portal" | "trigger" | "decoration-anchor";

export type SerializedBlockData = {
  encoding: "flat-edits-v1";
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
};

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
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  kind: MapKind;
  runtimeMode: MapRuntimeMode;
  dimensions: {
    width: 64;
    height: 12;
    depth: 64;
  };
  blockSize: 1;
  blocks: SerializedBlockData;
  zoneAssignments: MapZoneAssignment[];
  zones: MapZoneDefinition[];
  markers: MapMarkerDefinition[];
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
  spawnPoints: MapSpawnPoint[];
  cameraPresets: MapCameraPreset[];
  defaultSpawnId?: string;
  defaultCameraPresetId?: string;
  presentation?: Partial<MapPresentationConfig>;
  metadata?: MapDefinition["metadata"];
}): MapDefinition {
  const document = serializeMapDocument(input.world, markersToEntityAnchors(input.markers));

  return {
    schemaVersion: MAP_DEFINITION_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    description: input.description,
    kind: input.kind,
    runtimeMode: input.runtimeMode,
    dimensions: {
      width: WORLD_CONFIG.width,
      height: WORLD_CONFIG.height,
      depth: WORLD_CONFIG.depth,
    },
    blockSize: WORLD_CONFIG.blockSize,
    blocks: {
      encoding: "flat-edits-v1",
      generator: "flat-v1",
      edits: document.edits,
    },
    zoneAssignments: document.zones,
    zones: input.zones.map(cloneZone),
    markers: input.markers.map(cloneMarker),
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
  return {
    ...map,
    dimensions: { ...map.dimensions },
    blocks: { ...map.blocks, edits: map.blocks.edits.map((edit) => ({ ...edit })) },
    zoneAssignments: map.zoneAssignments.map((zone) => ({ ...zone })),
    zones: map.zones.map(cloneZone),
    markers: map.markers.map(cloneMarker),
    spawnPoints: map.spawnPoints.map(cloneSpawnPoint),
    cameraPresets: map.cameraPresets.map(cloneCameraPreset),
    presentation: { ...map.presentation },
    metadata: { ...map.metadata },
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
    version: 1,
    world: {
      width: WORLD_CONFIG.width,
      depth: WORLD_CONFIG.depth,
      height: WORLD_CONFIG.height,
      blockSize: WORLD_CONFIG.blockSize,
      chunkSize: WORLD_CONFIG.chunkSize,
      generator: "flat-v1",
    },
    edits: map.blocks.edits.map((edit) => ({ ...edit })),
    zones: map.zoneAssignments.map((zone) => ({ ...zone })),
    entities: markersToEntityAnchors(map.markers),
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
  };
}

export function validateMapDefinition(input: unknown): MapDefinitionValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ["Map definition must be an object."] };
  }

  const map = input as MapDefinition;
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
    errors.push("Map dimensions must match 64 x 64 x 12 with block size 1.");
  }
  if (!isRecord(map.blocks) || map.blocks.encoding !== "flat-edits-v1" || map.blocks.generator !== "flat-v1") {
    errors.push("Map blocks must use flat-edits-v1 storage.");
  } else {
    validateBlockEdits(map.blocks.edits, errors);
  }

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
    const key = `${edit.x},${edit.y},${edit.z}`;
    if (seen.has(key)) errors.push(`Duplicate block edit coordinate: ${key}.`);
    if (typeof blockId !== "number" || !isKnownBlockId(blockId)) errors.push(`Unknown block id: ${String(blockId)}.`);
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
    if (!isRecord(assignment) || !isGridCoordinate(assignment)) {
      errors.push("Every zone assignment must include integer x, y and z.");
      continue;
    }
    const zoneId = (assignment as Record<string, unknown>).zoneId;
    const key = `${assignment.x},${assignment.y},${assignment.z}`;
    if (seen.has(key)) errors.push(`Duplicate zone assignment coordinate: ${key}.`);
    if (typeof zoneId !== "number" || !validZoneNumbers.has(zoneId)) {
      errors.push(`Zone assignment ${key} references unknown numeric zone ${String(zoneId)}.`);
    }
    seen.add(key);
  }
}

function hasExpectedDimensions(map: MapDefinition) {
  return (
    map.dimensions?.width === WORLD_CONFIG.width &&
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

function isStableId(value: unknown) {
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
    y >= 0 &&
    y < WORLD_CONFIG.height &&
    z >= 0 &&
    z < WORLD_CONFIG.depth
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
