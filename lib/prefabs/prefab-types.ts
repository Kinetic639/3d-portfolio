import type { CollisionMode, EntityFootprint, PrimitiveType, SerializableTransform } from "@/lib/maps/map-entities";
import type { MapContentReference } from "@/lib/maps/map-definition";

export type PrefabCategory =
  | "architecture"
  | "infrastructure"
  | "roads-and-paths"
  | "street-furniture"
  | "nature"
  | "office"
  | "portfolio"
  | "signage"
  | "navigation"
  | "decoration"
  // Placeable-object categories for pieces converted out of the terrain
  // shape palette (see docs/world-registry-refactor-audit.md).
  | "roofs"
  | "fences"
  | "pipes-utilities"
  | "wooden-walls"
  | "retaining-structures"
  | "rocks-rubble"
  | "crystals-caves"
  | "ice-formations";

export type PrefabSize = "small" | "medium" | "large" | "custom" | "short" | "long" | "narrow" | "wide" | "low" | "tall" | "standard";

export type PrefabMaterialRole =
  | "terrain-neutral"
  | "structure-dark"
  | "structure-light"
  | "wood-proxy"
  | "metal-proxy"
  | "path-proxy"
  | "vegetation-trunk"
  | "vegetation-canopy"
  | "foliage-light"
  | "paper"
  | "sign-board"
  | "accent-orange"
  | "accent-blue"
  | "accent-green"
  | "accent-yellow"
  | "selection-validation";

export type PrefabPartDefinition = {
  id: string;
  primitive: PrimitiveType;
  transform: SerializableTransform;
  materialRole: PrefabMaterialRole;
  castPlaceholderShadow?: boolean;
  receivePlaceholderShadow?: boolean;
  selectable?: boolean;
};

export type PrefabVariantDefinition = {
  id: string;
  label: string;
  size: PrefabSize;
  scale?: { x: number; y: number; z: number };
  partOverrides?: Record<string, Partial<PrefabPartDefinition>>;
  footprintOverride?: EntityFootprint;
};

export type PrefabDefinition = {
  id: string;
  version: number;
  name: string;
  description: string;
  category: PrefabCategory;
  parts: PrefabPartDefinition[];
  variants: PrefabVariantDefinition[];
  defaultVariantId: string;
  footprint: EntityFootprint;
  collisionMode: CollisionMode;
  placement: {
    anchor: "bottom" | "center";
    snapToGrid: boolean;
    surfaceAttached: boolean;
    allowedRotations?: number[];
  };
  tags: string[];
  futureAssetSlot?: string;
};

export type PrefabAppearanceOverrides = {
  materialRoles?: Record<string, PrefabMaterialRole>;
  colors?: Record<string, string>;
};

export type PlacedPrefabInstance = {
  id: string;
  entityType: "prefab";
  prefabId: string;
  prefabVersion: number;
  variantId: string;
  transform: SerializableTransform;
  appearanceOverrides?: PrefabAppearanceOverrides;
  footprintOverride?: EntityFootprint;
  collisionModeOverride?: CollisionMode;
  zoneId?: string;
  markerId?: string;
  contentReference?: MapContentReference;
  assetReference?: string;
  groupId?: string;
  tags: string[];
  locked: boolean;
};

export type ResolvedPrefabPart = {
  entityId: string;
  prefabId: string;
  variantId: string;
  partId: string;
  primitive: PrimitiveType;
  materialRole: PrefabMaterialRole;
  color: string;
  transform: SerializableTransform;
  selectable: boolean;
};
