import * as THREE from "three";
import type { PlacedMapEntity, PrimitiveType, SerializableTransform } from "@/lib/maps/map-entities";
import { isPrefabMaterialRole, resolvePrefabMaterialColor } from "./prefab-materials";
import { getPrefabDefinition } from "./prefab-library";
import type { PrefabDefinition, PrefabPartDefinition, PrefabVariantDefinition, ResolvedPrefabPart } from "./prefab-types";

export type PrefabResolutionResult =
  | { ok: true; parts: ResolvedPrefabPart[]; prefab: PrefabDefinition; variant: PrefabVariantDefinition }
  | { ok: false; error: string; parts: ResolvedPrefabPart[] };

export function resolvePrefabInstance(entity: PlacedMapEntity): PrefabResolutionResult {
  if (entity.entityType !== "prefab" || !entity.prefabId) {
    return { ok: false, error: `Entity ${entity.id} is not a prefab instance.`, parts: [] };
  }

  const prefab = getPrefabDefinition(entity.prefabId);
  if (!prefab) {
    return { ok: false, error: `Missing prefab definition: ${entity.prefabId}.`, parts: [createMissingPrefabPart(entity)] };
  }

  const variantId = entity.variantId ?? prefab.defaultVariantId;
  const variant = prefab.variants.find((candidate) => candidate.id === variantId);
  if (!variant) {
    return { ok: false, error: `Missing prefab variant: ${prefab.id}/${variantId}.`, parts: [createMissingPrefabPart(entity)] };
  }

  return {
    ok: true,
    prefab,
    variant,
    parts: prefab.parts.map((part) => resolvePrefabPart(entity, prefab, variant, part)),
  };
}

export function resolvePrefabFootprint(entity: PlacedMapEntity) {
  if (entity.footprintOverride) return entity.footprintOverride;
  if (entity.entityType !== "prefab" || !entity.prefabId) return entity.footprint;
  const prefab = getPrefabDefinition(entity.prefabId);
  const variant = prefab?.variants.find((candidate) => candidate.id === (entity.variantId ?? prefab.defaultVariantId));
  return variant?.footprintOverride ?? prefab?.footprint ?? entity.footprint;
}

export function resolvePrefabCollisionMode(entity: PlacedMapEntity) {
  if (entity.collisionModeOverride) return entity.collisionModeOverride;
  if (entity.entityType !== "prefab" || !entity.prefabId) return entity.collisionMode;
  return getPrefabDefinition(entity.prefabId)?.collisionMode ?? entity.collisionMode;
}

export type PrefabVisualBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export function resolvePrefabVisualBounds(entity: PlacedMapEntity): PrefabVisualBounds | null {
  const resolved = resolvePrefabInstance(entity);
  if (!resolved.parts.length) {
    return null;
  }

  const bounds: PrefabVisualBounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };

  for (const part of resolved.parts) {
    const extents = getPrimitiveExtents(part.primitive);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(part.transform.position.x, part.transform.position.y, part.transform.position.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(part.transform.rotation.x, part.transform.rotation.y, part.transform.rotation.z)),
      new THREE.Vector3(part.transform.scale.x, part.transform.scale.y, part.transform.scale.z),
    );

    for (const corner of getBoundsCorners(extents)) {
      corner.applyMatrix4(matrix);
      bounds.minX = Math.min(bounds.minX, corner.x);
      bounds.maxX = Math.max(bounds.maxX, corner.x);
      bounds.minY = Math.min(bounds.minY, corner.y);
      bounds.maxY = Math.max(bounds.maxY, corner.y);
      bounds.minZ = Math.min(bounds.minZ, corner.z);
      bounds.maxZ = Math.max(bounds.maxZ, corner.z);
    }
  }

  return bounds;
}

function resolvePrefabPart(
  entity: PlacedMapEntity,
  prefab: PrefabDefinition,
  variant: PrefabVariantDefinition,
  part: PrefabPartDefinition,
): ResolvedPrefabPart {
  const override = variant.partOverrides?.[part.id];
  const nextPart = { ...part, ...override, transform: override?.transform ?? part.transform };
  const variantScale = variant.scale ?? { x: 1, y: 1, z: 1 };
  const transform = combineTransforms(entity.transform, scalePartTransform(nextPart.transform, variantScale));
  const overrideRole = entity.appearanceOverrides?.materialRoles?.[nextPart.materialRole];
  const role = overrideRole && isPrefabMaterialRole(overrideRole) ? overrideRole : nextPart.materialRole;

  return {
    entityId: entity.id,
    prefabId: prefab.id,
    variantId: variant.id,
    partId: nextPart.id,
    primitive: nextPart.primitive,
    materialRole: role,
    color: resolvePrefabMaterialColor(role, entity.appearanceOverrides?.colors?.[role] ?? entity.appearanceOverrides?.colors?.[nextPart.id]),
    transform,
    selectable: nextPart.selectable ?? true,
  };
}

export function combineTransforms(parent: SerializableTransform, child: SerializableTransform): SerializableTransform {
  const parentPosition = new THREE.Vector3(parent.position.x, parent.position.y, parent.position.z);
  const parentQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(parent.rotation.x, parent.rotation.y, parent.rotation.z));
  const childPosition = new THREE.Vector3(
    child.position.x * parent.scale.x,
    child.position.y * parent.scale.y,
    child.position.z * parent.scale.z,
  ).applyQuaternion(parentQuaternion).add(parentPosition);
  const childQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(child.rotation.x, child.rotation.y, child.rotation.z));
  const rotation = new THREE.Euler().setFromQuaternion(parentQuaternion.multiply(childQuaternion));

  return {
    position: { x: round(childPosition.x), y: round(childPosition.y), z: round(childPosition.z) },
    rotation: { x: round(rotation.x), y: round(rotation.y), z: round(rotation.z) },
    scale: {
      x: round(parent.scale.x * child.scale.x),
      y: round(parent.scale.y * child.scale.y),
      z: round(parent.scale.z * child.scale.z),
    },
  };
}

function scalePartTransform(transform: SerializableTransform, scale: { x: number; y: number; z: number }): SerializableTransform {
  return {
    position: {
      x: transform.position.x * scale.x,
      y: transform.position.y * scale.y,
      z: transform.position.z * scale.z,
    },
    rotation: { ...transform.rotation },
    scale: {
      x: transform.scale.x * scale.x,
      y: transform.scale.y * scale.y,
      z: transform.scale.z * scale.z,
    },
  };
}

function createMissingPrefabPart(entity: PlacedMapEntity): ResolvedPrefabPart {
  return {
    entityId: entity.id,
    prefabId: entity.prefabId ?? "missing",
    variantId: entity.variantId ?? "missing",
    partId: "missing-prefab-placeholder",
    primitive: "box",
    materialRole: "selection-validation",
    color: "#ff4d4d",
    transform: entity.transform,
    selectable: true,
  };
}

function round(value: number) {
  return Number(value.toFixed(5));
}

function getPrimitiveExtents(primitive: PrimitiveType) {
  switch (primitive) {
    case "plane":
      return { x: 0.5, y: 0.02, z: 0.5 };
    case "platform":
      return { x: 0.5, y: 0.11, z: 0.5 };
    case "sign":
      return { x: 0.5, y: 0.36, z: 0.04 };
    default:
      return { x: 0.5, y: 0.5, z: 0.5 };
  }
}

function getBoundsCorners(extents: { x: number; y: number; z: number }) {
  return [
    new THREE.Vector3(-extents.x, -extents.y, -extents.z),
    new THREE.Vector3(extents.x, -extents.y, -extents.z),
    new THREE.Vector3(-extents.x, extents.y, -extents.z),
    new THREE.Vector3(extents.x, extents.y, -extents.z),
    new THREE.Vector3(-extents.x, -extents.y, extents.z),
    new THREE.Vector3(extents.x, -extents.y, extents.z),
    new THREE.Vector3(-extents.x, extents.y, extents.z),
    new THREE.Vector3(extents.x, extents.y, extents.z),
  ];
}
