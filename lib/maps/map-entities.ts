import type { MapContentReference } from "./map-definition";

export type PrimitiveType = "box" | "cylinder" | "sphere" | "plane" | "platform" | "sign";
export type CollisionMode = "none" | "blocking" | "walkable" | "trigger";
export type PlacedEntityType = "primitive" | "sign" | "decoration-anchor" | "landmark-placeholder";

export type SerializableVector3 = {
  x: number;
  y: number;
  z: number;
};

export type SerializableTransform = {
  position: SerializableVector3;
  rotation: SerializableVector3;
  scale: SerializableVector3;
};

export type EntityFootprint = {
  width: number;
  depth: number;
  height: number;
};

export type SignConfiguration = {
  label: string;
  subtitle?: string;
  arrow?: "none" | "forward" | "left" | "right";
};

export type PlacedMapEntity = {
  id: string;
  name: string;
  entityType: PlacedEntityType;
  primitiveType: PrimitiveType;
  transform: SerializableTransform;
  placement: {
    anchor: "bottom" | "center";
    snapToGrid: boolean;
    surfaceAttached: boolean;
    surfaceOffset: number;
  };
  appearance: {
    color: string;
    opacity?: number;
    visibleAtRuntime: boolean;
    visibleInEditor: boolean;
  };
  footprint: EntityFootprint;
  collisionMode: CollisionMode;
  zoneId?: string;
  markerId?: string;
  contentReference?: MapContentReference;
  assetReference?: string;
  groupId?: string;
  tags: string[];
  locked: boolean;
  sign?: SignConfiguration;
};

export type EntityGroupDefinition = {
  id: string;
  name: string;
  locked: boolean;
  hidden: boolean;
};

export const ENTITY_PRIMITIVE_TYPES: PrimitiveType[] = ["box", "cylinder", "sphere", "plane", "platform", "sign"];
export const ENTITY_COLLISION_MODES: CollisionMode[] = ["none", "blocking", "walkable", "trigger"];
export const ENTITY_TYPES: PlacedEntityType[] = ["primitive", "sign", "decoration-anchor", "landmark-placeholder"];

export function createDefaultTransform(position: SerializableVector3 = { x: 0, y: 0.5, z: 0 }): SerializableTransform {
  return {
    position: { ...position },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

export function createPlacedEntity(input: Partial<PlacedMapEntity> & { id: string; name?: string; primitiveType?: PrimitiveType }): PlacedMapEntity {
  const primitiveType = input.primitiveType ?? "box";
  return {
    id: input.id,
    name: input.name ?? input.id,
    entityType: input.entityType ?? (primitiveType === "sign" ? "sign" : "primitive"),
    primitiveType,
    transform: cloneTransform(input.transform ?? createDefaultTransform()),
    placement: {
      anchor: input.placement?.anchor ?? "bottom",
      snapToGrid: input.placement?.snapToGrid ?? true,
      surfaceAttached: input.placement?.surfaceAttached ?? true,
      surfaceOffset: input.placement?.surfaceOffset ?? 0,
    },
    appearance: {
      color: input.appearance?.color ?? "#9ca3af",
      opacity: input.appearance?.opacity,
      visibleAtRuntime: input.appearance?.visibleAtRuntime ?? true,
      visibleInEditor: input.appearance?.visibleInEditor ?? true,
    },
    footprint: {
      width: input.footprint?.width ?? 1,
      depth: input.footprint?.depth ?? 1,
      height: input.footprint?.height ?? 1,
    },
    collisionMode: input.collisionMode ?? "blocking",
    zoneId: input.zoneId,
    markerId: input.markerId,
    contentReference: input.contentReference ? { ...input.contentReference } : undefined,
    assetReference: input.assetReference,
    groupId: input.groupId,
    tags: [...(input.tags ?? [])],
    locked: input.locked ?? false,
    sign: input.sign ? { ...input.sign } : primitiveType === "sign" ? { label: input.name ?? input.id, arrow: "none" } : undefined,
  };
}

export function clonePlacedEntity(entity: PlacedMapEntity): PlacedMapEntity {
  return {
    ...entity,
    transform: entity.transform ? cloneTransform(entity.transform) : createDefaultTransform(),
    placement: entity.placement ? { ...entity.placement } : {
      anchor: "bottom",
      snapToGrid: true,
      surfaceAttached: true,
      surfaceOffset: 0,
    },
    appearance: entity.appearance ? { ...entity.appearance } : {
      color: "#9ca3af",
      visibleAtRuntime: true,
      visibleInEditor: true,
    },
    footprint: entity.footprint ? { ...entity.footprint } : { width: 1, depth: 1, height: 1 },
    contentReference: entity.contentReference ? { ...entity.contentReference } : undefined,
    tags: Array.isArray(entity.tags) ? [...entity.tags] : [],
    sign: entity.sign ? { ...entity.sign } : undefined,
  };
}

export function cloneEntityGroup(group: EntityGroupDefinition): EntityGroupDefinition {
  return { ...group };
}

export function cloneTransform(transform: SerializableTransform): SerializableTransform {
  return {
    position: { ...transform.position },
    rotation: { ...transform.rotation },
    scale: { ...transform.scale },
  };
}
