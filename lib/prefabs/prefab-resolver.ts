import * as THREE from "three";
import type { PlacedMapEntity, SerializableTransform } from "@/lib/maps/map-entities";
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
