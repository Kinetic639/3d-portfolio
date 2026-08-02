import { type BlockId, isKnownBlockId } from "./block-registry";
import { createFlatVoxelWorld, type VoxelWorld } from "./voxel-world";
import { WORLD_CONFIG, type GridCoordinate } from "./world-config";
import { incrementEditorPerfCounter } from "@/lib/editor/editor-performance-counters";

export const MAP_DOCUMENT_VERSION = 1;
export const MAP_DOCUMENT_FILENAME = "portfolio-map.v1.json";

export type MapEntityAnchor = {
  id: string;
  type: "marker";
  gridPosition: GridCoordinate;
  rotationY: number;
  offset?: { x: number; y: number; z: number };
  metadata?: Record<string, string | number | boolean>;
};

export type MapBlockEdit = GridCoordinate & {
  blockId: BlockId;
};

export type MapZoneAssignment = GridCoordinate & {
  zoneId: number;
};

export type MapDocument = {
  version: 1;
  world: {
    width: 64;
    depth: 64;
    height: 12;
    blockSize: 1;
    chunkSize: 16;
    generator: "flat-v1";
  };
  edits: MapBlockEdit[];
  zones: MapZoneAssignment[];
  entities: MapEntityAnchor[];
};

export type MapDocumentResult =
  | { ok: true; document: MapDocument }
  | { ok: false; error: string };

export type ImportedMapState = {
  world: VoxelWorld;
  entities: MapEntityAnchor[];
};

export function serializeMapDocument(world: VoxelWorld, entities: MapEntityAnchor[]): MapDocument {
  incrementEditorPerfCounter("mapSerializations");
  const baseWorld = createFlatVoxelWorld();
  const edits: MapBlockEdit[] = [];
  const zones: MapZoneAssignment[] = [];

  for (let index = 0; index < world.blocks.length; index += 1) {
    const blockId = world.blocks[index] as BlockId;
    const coordinates = world.getCoordinates(index);

    if (!coordinates) {
      continue;
    }

    if (blockId !== baseWorld.blocks[index]) {
      edits.push({ ...coordinates, blockId });
    }

    const zoneId = world.zones[index];
    if (zoneId !== 0) {
      zones.push({ ...coordinates, zoneId });
    }
  }

  edits.sort(compareCoordinates);
  zones.sort(compareCoordinates);

  return {
    version: MAP_DOCUMENT_VERSION,
    world: {
      width: WORLD_CONFIG.width,
      depth: WORLD_CONFIG.depth,
      height: WORLD_CONFIG.height,
      blockSize: WORLD_CONFIG.blockSize,
      chunkSize: WORLD_CONFIG.chunkSize,
      generator: "flat-v1",
    },
    edits,
    zones,
    entities: [...entities].sort((a, b) => a.id.localeCompare(b.id)).map(cloneEntity),
  };
}

export function parseMapDocument(input: unknown): MapDocumentResult {
  if (!isRecord(input)) {
    return { ok: false, error: "Map document must be a JSON object." };
  }

  if (input.version !== MAP_DOCUMENT_VERSION) {
    return { ok: false, error: `Unsupported map document version: ${String(input.version)}.` };
  }

  const world = input.world;
  if (!isRecord(world) || world.generator !== "flat-v1") {
    return { ok: false, error: "Map document world generator must be flat-v1." };
  }

  if (
    world.width !== WORLD_CONFIG.width ||
    world.depth !== WORLD_CONFIG.depth ||
    world.height !== WORLD_CONFIG.height ||
    world.blockSize !== WORLD_CONFIG.blockSize ||
    world.chunkSize !== WORLD_CONFIG.chunkSize
  ) {
    return { ok: false, error: "Map document dimensions do not match the current world." };
  }

  const edits = parseBlockEdits(input.edits);
  if (!edits.ok) {
    return edits;
  }

  const zones = parseZoneAssignments(input.zones);
  if (!zones.ok) {
    return zones;
  }

  const entities = parseEntityAnchors(input.entities);
  if (!entities.ok) {
    return entities;
  }

  return {
    ok: true,
    document: {
      version: MAP_DOCUMENT_VERSION,
      world: {
        width: WORLD_CONFIG.width,
        depth: WORLD_CONFIG.depth,
        height: WORLD_CONFIG.height,
        blockSize: WORLD_CONFIG.blockSize,
        chunkSize: WORLD_CONFIG.chunkSize,
        generator: "flat-v1",
      },
      edits: edits.value.sort(compareCoordinates),
      zones: zones.value.sort(compareCoordinates),
      entities: entities.value.sort((a, b) => a.id.localeCompare(b.id)),
    },
  };
}

export function createMapStateFromDocument(document: MapDocument): ImportedMapState {
  const world = createFlatVoxelWorld();

  for (const edit of document.edits) {
    world.setBlock(edit.x, edit.y, edit.z, edit.blockId);
  }

  for (const zone of document.zones) {
    world.setZone(zone.x, zone.y, zone.z, zone.zoneId);
  }

  world.clearDirtyChunks();

  return {
    world,
    entities: document.entities.map(cloneEntity),
  };
}

export function documentsEqual(left: MapDocument, right: MapDocument) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseBlockEdits(input: unknown): { ok: true; value: MapBlockEdit[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Map document edits must be an array." };
  }

  const edits: MapBlockEdit[] = [];
  const seen = new Set<number>();
  const validationWorld = createFlatVoxelWorld();

  for (const value of input) {
    if (!isRecord(value) || !isGridCoordinate(value)) {
      return { ok: false, error: "Every block edit must include integer x, y and z coordinates." };
    }
    if (!isKnownBlockId(value.blockId as number)) {
      return { ok: false, error: `Unknown block id: ${String(value.blockId)}.` };
    }

    const index = validationWorld.getIndex(value.x, value.y, value.z);
    if (index === null) {
      return { ok: false, error: `Block edit coordinate is out of bounds: ${value.x},${value.y},${value.z}.` };
    }
    if (seen.has(index)) {
      return { ok: false, error: `Duplicate block edit coordinate: ${value.x},${value.y},${value.z}.` };
    }

    seen.add(index);
    edits.push({ x: value.x, y: value.y, z: value.z, blockId: value.blockId as BlockId });
  }

  return { ok: true, value: edits };
}

function parseZoneAssignments(input: unknown): { ok: true; value: MapZoneAssignment[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Map document zones must be an array." };
  }

  const zones: MapZoneAssignment[] = [];
  const seen = new Set<number>();
  const validationWorld = createFlatVoxelWorld();

  for (const value of input) {
    if (!isRecord(value) || !isGridCoordinate(value)) {
      return { ok: false, error: "Every zone assignment must include integer x, y and z coordinates." };
    }
    const zoneId = value.zoneId;
    if (typeof zoneId !== "number" || !Number.isInteger(zoneId) || zoneId < 0 || zoneId > 5) {
      return { ok: false, error: `Zone id must be between 0 and 5: ${String(value.zoneId)}.` };
    }

    const index = validationWorld.getIndex(value.x, value.y, value.z);
    if (index === null) {
      return { ok: false, error: `Zone coordinate is out of bounds: ${value.x},${value.y},${value.z}.` };
    }
    if (seen.has(index)) {
      return { ok: false, error: `Duplicate zone coordinate: ${value.x},${value.y},${value.z}.` };
    }

    seen.add(index);
    zones.push({ x: value.x, y: value.y, z: value.z, zoneId });
  }

  return { ok: true, value: zones };
}

function parseEntityAnchors(input: unknown): { ok: true; value: MapEntityAnchor[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Map document entities must be an array." };
  }

  const entities: MapEntityAnchor[] = [];
  const seen = new Set<string>();
  const validationWorld = createFlatVoxelWorld();

  for (const value of input) {
    if (!isRecord(value) || typeof value.id !== "string" || value.type !== "marker") {
      return { ok: false, error: "Every entity must include a string id and marker type." };
    }
    if (seen.has(value.id)) {
      return { ok: false, error: `Duplicate entity id: ${value.id}.` };
    }
    if (!isRecord(value.gridPosition) || !isGridCoordinate(value.gridPosition)) {
      return { ok: false, error: `Entity ${value.id} must include integer grid coordinates.` };
    }
    if (validationWorld.getIndex(value.gridPosition.x, value.gridPosition.y, value.gridPosition.z) === null) {
      return { ok: false, error: `Entity ${value.id} coordinate is out of bounds.` };
    }
    if (!Number.isFinite(value.rotationY)) {
      return { ok: false, error: `Entity ${value.id} rotationY must be numeric.` };
    }

    seen.add(value.id);
    entities.push(cloneEntity(value as MapEntityAnchor));
  }

  return { ok: true, value: entities };
}

function compareCoordinates(left: GridCoordinate, right: GridCoordinate) {
  return left.y - right.y || left.z - right.z || left.x - right.x;
}

function cloneEntity(entity: MapEntityAnchor): MapEntityAnchor {
  return {
    id: entity.id,
    type: "marker",
    gridPosition: { ...entity.gridPosition },
    rotationY: entity.rotationY,
    offset: entity.offset ? { ...entity.offset } : undefined,
    metadata: entity.metadata ? { ...entity.metadata } : undefined,
  };
}

function isGridCoordinate(value: Record<string, unknown>): value is GridCoordinate & Record<string, unknown> {
  return Number.isInteger(value.x) && Number.isInteger(value.y) && Number.isInteger(value.z);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
