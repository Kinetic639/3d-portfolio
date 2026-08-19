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
import { getWorldMaxY, WORLD_CONFIG } from "@/lib/world/world-config";
import { getPrefabDefinition } from "@/lib/prefabs/prefab-library";
import { resolvePrefabCollisionMode, resolvePrefabFootprint } from "@/lib/prefabs/prefab-resolver";

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

export type PrefabPlacementDraft = {
  prefabId: string;
  variantId: string;
  name: string;
  transform: SerializableTransform;
  color?: string;
  collisionModeOverride?: CollisionMode;
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

export function createPrefabEntityFromDraft(draft: PrefabPlacementDraft, existingIds: Set<string>) {
  const prefab = getPrefabDefinition(draft.prefabId);
  const variant = prefab?.variants.find((candidate) => candidate.id === draft.variantId);
  const id = createStableEntityId(draft.name || prefab?.name || "prefab", existingIds);
  const footprint = variant?.footprintOverride ?? prefab?.footprint ?? { width: 1, depth: 1, height: 1 };
  const collisionMode = draft.collisionModeOverride ?? prefab?.collisionMode ?? "blocking";

  return createPlacedEntity({
    id,
    name: draft.name || prefab?.name || id,
    entityType: "prefab",
    primitiveType: "box",
    prefabId: draft.prefabId,
    prefabVersion: prefab?.version ?? 0,
    variantId: draft.variantId,
    transform: cloneTransform(draft.transform),
    placement: {
      anchor: prefab?.placement.anchor ?? "bottom",
      snapToGrid: prefab?.placement.snapToGrid ?? true,
      surfaceAttached: prefab?.placement.surfaceAttached ?? true,
      surfaceOffset: 0,
    },
    appearance: {
      color: draft.color ?? "#9ca3af",
      visibleAtRuntime: true,
      visibleInEditor: true,
    },
    appearanceOverrides: draft.color ? { colors: { "accent-blue": draft.color } } : undefined,
    footprint,
    collisionMode,
    collisionModeOverride: draft.collisionModeOverride,
    zoneId: draft.zoneId,
    markerId: draft.markerId,
    assetReference: draft.assetReference ?? prefab?.futureAssetSlot,
    tags: [...(prefab?.tags ?? []), "prefab-instance"],
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
  if (entity.transform.position.y < WORLD_CONFIG.minY) messages.push("Entity position is below the world floor.");
  if (entity.zoneId && !map.zones.some((zone) => zone.id === entity.zoneId)) messages.push(`Unknown zone: ${entity.zoneId}.`);
  if (entity.markerId && !map.markers.some((marker) => marker.id === entity.markerId)) messages.push(`Unknown marker: ${entity.markerId}.`);
  if (entity.entityType === "prefab") {
    if (!entity.prefabId) {
      messages.push(`Entity ${entity.id} is missing prefab id.`);
    } else {
      const prefab = getPrefabDefinition(entity.prefabId);
      if (!prefab) {
        messages.push(`Missing prefab definition: ${entity.prefabId}.`);
      } else if (!prefab.variants.some((variant) => variant.id === (entity.variantId ?? prefab.defaultVariantId))) {
        messages.push(`Missing prefab variant: ${entity.prefabId}/${entity.variantId ?? prefab.defaultVariantId}.`);
      } else if (entity.prefabVersion !== undefined && entity.prefabVersion > prefab.version) {
        warnings.push(`Prefab ${entity.prefabId} was saved with newer version ${entity.prefabVersion}.`);
      }
    }
  }

  for (const other of map.entities) {
    if (
      other.id !== entity.id &&
      resolvePrefabCollisionMode(entity) !== "none" &&
      resolvePrefabCollisionMode(other) !== "none" &&
      boxesOverlap(getEntityBounds(entity), getEntityBounds(other))
    ) {
      messages.push(`Placement overlaps ${other.id}.`);
    }
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
  const footprint = resolvePrefabFootprint(entity);
  const halfWidth = Math.abs(footprint.width) / 2;
  const halfDepth = Math.abs(footprint.depth) / 2;
  const height = Math.abs(footprint.height);
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
  return position.x >= -edge && position.x <= edge && position.z >= -edge && position.z <= edge && position.y >= WORLD_CONFIG.minY && position.y <= getWorldMaxY() + 8;
}
