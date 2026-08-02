import type { MapDefinition } from "@/lib/maps/map-definition";
import {
  clonePlacedEntity,
  cloneTransform,
  createPlacedEntity,
  type CollisionMode,
  type PlacedMapEntity,
  type PrimitiveType,
  type SerializableTransform,
  type SerializableVector3,
} from "@/lib/maps/map-entities";
import { WORLD_CONFIG } from "@/lib/world/world-config";

export type PlacementSeverity = "valid" | "warning" | "invalid";

export type PlacementValidationResult = {
  severity: PlacementSeverity;
  messages: string[];
};

export type EntityPlacementDraft = {
  primitiveType: PrimitiveType;
  name: string;
  transform: SerializableTransform;
  color: string;
  collisionMode: CollisionMode;
  zoneId?: string;
  markerId?: string;
  assetReference?: string;
};

export function snapValue(value: number, step: number) {
  if (!Number.isFinite(value) || step <= 0) return value;
  return Math.round(value / step) * step;
}

export function snapTransform(
  transform: SerializableTransform,
  settings: { positionStep: number; rotationStep: number; scaleStep: number },
): SerializableTransform {
  return {
    position: {
      x: snapValue(transform.position.x, settings.positionStep),
      y: snapValue(transform.position.y, settings.positionStep),
      z: snapValue(transform.position.z, settings.positionStep),
    },
    rotation: {
      x: snapValue(transform.rotation.x, settings.rotationStep),
      y: snapValue(transform.rotation.y, settings.rotationStep),
      z: snapValue(transform.rotation.z, settings.rotationStep),
    },
    scale: {
      x: Math.max(settings.scaleStep, snapValue(transform.scale.x, settings.scaleStep)),
      y: Math.max(settings.scaleStep, snapValue(transform.scale.y, settings.scaleStep)),
      z: Math.max(settings.scaleStep, snapValue(transform.scale.z, settings.scaleStep)),
    },
  };
}

export function createEntityFromDraft(draft: EntityPlacementDraft, existingIds: Set<string>) {
  const id = createStableEntityId(draft.name, existingIds);
  return createPlacedEntity({
    id,
    name: draft.name,
    primitiveType: draft.primitiveType,
    transform: cloneTransform(draft.transform),
    appearance: {
      color: draft.color,
      visibleAtRuntime: true,
      visibleInEditor: true,
    },
    footprint: {
      width: Math.abs(draft.transform.scale.x),
      depth: Math.abs(draft.transform.scale.z),
      height: Math.abs(draft.transform.scale.y),
    },
    collisionMode: draft.collisionMode,
    zoneId: draft.zoneId,
    markerId: draft.markerId,
    assetReference: draft.assetReference,
    tags: [],
  });
}

export function validateEntityPlacement(map: MapDefinition, entity: PlacedMapEntity, options: { force?: boolean } = {}): PlacementValidationResult {
  const messages: string[] = [];
  const warnings: string[] = [];

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entity.id)) messages.push("Entity id must be stable lowercase text.");
  if (map.entities.some((candidate) => candidate.id === entity.id)) messages.push(`Duplicate entity id: ${entity.id}.`);
  if (!isFiniteTransform(entity.transform)) messages.push("Entity transform contains invalid numbers.");
  if (entity.footprint.width <= 0 || entity.footprint.depth <= 0 || entity.footprint.height <= 0) messages.push("Entity footprint must be positive.");
  if (!isInsideMapEdges(entity.transform.position)) messages.push("Entity position is outside map-edge bounds.");
  if (entity.transform.position.y < 0) messages.push("Entity cannot be placed underground.");
  if (entity.zoneId && !map.zones.some((zone) => zone.id === entity.zoneId)) messages.push(`Unknown zone: ${entity.zoneId}.`);
  if (entity.markerId && !map.markers.some((marker) => marker.id === entity.markerId)) messages.push(`Unknown marker: ${entity.markerId}.`);

  if (entity.collisionMode === "blocking") {
    for (const other of map.entities) {
      if (other.id !== entity.id && other.collisionMode === "blocking" && boxesOverlap(getEntityBounds(entity), getEntityBounds(other))) {
        messages.push(`Blocking overlap with ${other.id}.`);
      }
    }
  } else if (map.entities.some((other) => other.id !== entity.id && other.collisionMode === "blocking" && boxesOverlap(getEntityBounds(entity), getEntityBounds(other)))) {
    warnings.push("Placement overlaps a blocking entity but this entity is non-blocking.");
  }

  return {
    severity: messages.length > 0 ? "invalid" : warnings.length > 0 && !options.force ? "warning" : "valid",
    messages: [...messages, ...warnings],
  };
}

export function addEntity(map: MapDefinition, entity: PlacedMapEntity): MapDefinition {
  return {
    ...map,
    entities: [...map.entities.map(clonePlacedEntity), clonePlacedEntity(entity)],
    metadata: { ...map.metadata, updatedAt: new Date().toISOString() },
  };
}

export function updateEntity(map: MapDefinition, id: string, update: (entity: PlacedMapEntity) => PlacedMapEntity): MapDefinition {
  return {
    ...map,
    entities: map.entities.map((entity) => entity.id === id ? clonePlacedEntity(update(clonePlacedEntity(entity))) : clonePlacedEntity(entity)),
    metadata: { ...map.metadata, updatedAt: new Date().toISOString() },
  };
}

export function deleteEntities(map: MapDefinition, ids: string[]): MapDefinition {
  const remove = new Set(ids);
  return {
    ...map,
    entities: map.entities.filter((entity) => !remove.has(entity.id)).map(clonePlacedEntity),
    metadata: { ...map.metadata, updatedAt: new Date().toISOString() },
  };
}

export function duplicateEntities(map: MapDefinition, ids: string[], offset: SerializableVector3 = { x: 1, y: 0, z: 1 }): MapDefinition {
  const existing = new Set(map.entities.map((entity) => entity.id));
  const duplicates = map.entities
    .filter((entity) => ids.includes(entity.id))
    .map((entity) => {
      const copy = clonePlacedEntity(entity);
      copy.id = createStableEntityId(`${copy.id}-copy`, existing);
      copy.name = `${copy.name} Copy`;
      copy.transform.position.x += offset.x;
      copy.transform.position.y += offset.y;
      copy.transform.position.z += offset.z;
      existing.add(copy.id);
      return copy;
    });

  return {
    ...map,
    entities: [...map.entities.map(clonePlacedEntity), ...duplicates],
    metadata: { ...map.metadata, updatedAt: new Date().toISOString() },
  };
}

export function groupEntities(map: MapDefinition, entityIds: string[], groupId: string, name: string): MapDefinition {
  return {
    ...map,
    entityGroups: [...map.entityGroups, { id: groupId, name, locked: false, hidden: false }],
    entities: map.entities.map((entity) => entityIds.includes(entity.id) ? { ...clonePlacedEntity(entity), groupId } : clonePlacedEntity(entity)),
  };
}

export function ungroupEntities(map: MapDefinition, groupId: string): MapDefinition {
  return {
    ...map,
    entityGroups: map.entityGroups.filter((group) => group.id !== groupId),
    entities: map.entities.map((entity) => entity.groupId === groupId ? { ...clonePlacedEntity(entity), groupId: undefined } : clonePlacedEntity(entity)),
  };
}

export function getEntityBounds(entity: PlacedMapEntity) {
  const halfWidth = Math.abs(entity.footprint.width) / 2;
  const halfDepth = Math.abs(entity.footprint.depth) / 2;
  const height = Math.abs(entity.footprint.height);
  const anchorOffset = entity.placement.anchor === "bottom" ? height / 2 : 0;

  return {
    minX: entity.transform.position.x - halfWidth,
    maxX: entity.transform.position.x + halfWidth,
    minY: entity.transform.position.y + anchorOffset - height / 2,
    maxY: entity.transform.position.y + anchorOffset + height / 2,
    minZ: entity.transform.position.z - halfDepth,
    maxZ: entity.transform.position.z + halfDepth,
  };
}

function boxesOverlap(left: ReturnType<typeof getEntityBounds>, right: ReturnType<typeof getEntityBounds>) {
  return left.minX < right.maxX && left.maxX > right.minX &&
    left.minY < right.maxY && left.maxY > right.minY &&
    left.minZ < right.maxZ && left.maxZ > right.minZ;
}

function createStableEntityId(name: string, existingIds: Set<string>) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "entity";
  let id = base;
  let suffix = 2;
  while (existingIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function isFiniteTransform(transform: SerializableTransform) {
  return isFiniteVector(transform.position) && isFiniteVector(transform.rotation) && isFiniteVector(transform.scale);
}

function isFiniteVector(vector: SerializableVector3) {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function isInsideMapEdges(position: SerializableVector3) {
  const edge = WORLD_CONFIG.width / 2;
  return position.x >= -edge && position.x <= edge && position.z >= -edge && position.z <= edge && position.y <= WORLD_CONFIG.height + 8;
}
