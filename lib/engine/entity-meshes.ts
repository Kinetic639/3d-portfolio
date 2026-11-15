import * as THREE from "three";
import type { PlacedMapEntity, PrimitiveType, SerializableTransform } from "@/lib/maps/map-entities";
import { resolvePrefabInstance } from "@/lib/prefabs/prefab-resolver";

/**
 * Placeholder object rendering: procedural prefabs and primitives become
 * instanced boxes, cylinders and spheres, one draw call per (shape, colour).
 * The asset pipeline swaps these for real models through the same entry
 * point; each instance keeps its entity id so picking can map a hit back.
 */
export type EntityLayer = {
  group: THREE.Group;
  /** Entity id for an instanced hit, or null. */
  entityIdAt: (object: THREE.Object3D, instanceId: number | undefined) => string | null;
  dispose: () => void;
};

type Part = { entityId: string; primitive: PrimitiveType; color: string; transform: SerializableTransform };

const ANCHOR_OFFSET: Record<PrimitiveType, number> = { box: 0.5, cylinder: 0.5, sphere: 0.5, plane: 0.02, platform: 0.11, sign: 0.36 };

function createPrimitiveGeometry(primitive: PrimitiveType): THREE.BufferGeometry {
  switch (primitive) {
    case "cylinder": return new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
    case "sphere": return new THREE.SphereGeometry(0.5, 16, 10);
    case "plane": return new THREE.BoxGeometry(1, 0.04, 1);
    case "platform": return new THREE.BoxGeometry(1, 0.22, 1);
    case "sign": return new THREE.BoxGeometry(1, 0.72, 0.08);
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

function collectParts(entity: PlacedMapEntity): Part[] {
  if (entity.entityType === "prefab") {
    return resolvePrefabInstance(entity).parts.map((part) => ({
      entityId: entity.id,
      primitive: part.primitive,
      color: part.color,
      transform: part.transform,
    }));
  }
  const transform: SerializableTransform = {
    position: { ...entity.transform.position },
    rotation: { ...entity.transform.rotation },
    scale: { ...entity.transform.scale },
  };
  if (entity.placement.anchor === "bottom") {
    // Primitive geometry is centred; bottom-anchored entities store the point they stand on.
    transform.position.y += ANCHOR_OFFSET[entity.primitiveType] * transform.scale.y;
  }
  return [{ entityId: entity.id, primitive: entity.primitiveType, color: entity.appearance.color, transform }];
}

export function buildEntityLayer(entities: PlacedMapEntity[]): EntityLayer {
  const group = new THREE.Group();
  group.name = "entities";
  const batches = new Map<string, Part[]>();
  for (const entity of entities) {
    if (!entity.appearance.visibleAtRuntime) continue;
    for (const part of collectParts(entity)) {
      const key = `${part.primitive}|${part.color.toLowerCase()}`;
      const batch = batches.get(key);
      if (batch) batch.push(part);
      else batches.set(key, [part]);
    }
  }

  const disposables: Array<{ dispose: () => void }> = [];
  const instanceEntities = new Map<THREE.Object3D, string[]>();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();

  for (const [key, parts] of batches) {
    const [primitive, color] = key.split("|") as [PrimitiveType, string];
    const geometry = createPrimitiveGeometry(primitive);
    const material = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.name = `entities:${key}`;
    parts.forEach((part, index) => {
      const { position: p, rotation: r, scale: s } = part.transform;
      matrix.compose(position.set(p.x, p.y, p.z), quaternion.setFromEuler(euler.set(r.x, r.y, r.z)), scale.set(s.x, s.y, s.z));
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.matrixAutoUpdate = false;
    instanceEntities.set(mesh, parts.map((part) => part.entityId));
    disposables.push(geometry, material, mesh);
    group.add(mesh);
  }

  return {
    group,
    entityIdAt: (object, instanceId) => (instanceId === undefined ? null : instanceEntities.get(object)?.[instanceId] ?? null),
    dispose() {
      disposables.forEach((item) => item.dispose());
      group.clear();
    },
  };
}
