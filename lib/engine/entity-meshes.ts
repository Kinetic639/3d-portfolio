import * as THREE from "three";
import type { PlacedMapEntity, PrimitiveType, SerializableTransform } from "@/lib/maps/map-entities";
import { resolvePrefabInstance } from "@/lib/prefabs/prefab-resolver";

/**
 * Placeholder object rendering: procedural prefabs and primitives become
 * instanced boxes, cylinders and spheres, one draw call per (shape, colour).
 * The asset pipeline swaps these for real models through the same entry
 * point. The layer also owns what interaction needs from objects: a bounding
 * box per entity and a per-entity "fade" switch used to see through objects
 * that hide something the visitor is looking at.
 */
export type EntityLayer = {
  group: THREE.Group;
  /** World-space bounds per entity id. */
  bounds: ReadonlyMap<string, THREE.Box3>;
  /** Fades exactly the given entities. Returns true when anything changed. */
  setFaded: (entityIds: ReadonlySet<string>) => boolean;
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

/**
 * Adds a screen-door fade to a standard material, driven by the per-instance
 * `aFade` attribute. Discarding pixels in a fixed pattern keeps the material
 * opaque (no sorting, no extra pass) while letting the scene behind show through.
 */
function addInstanceFade(material: THREE.Material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFade;\nvarying float vFade;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFade = aFade;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFade;")
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        if (vFade > 0.0) {
          vec2 cell = mod(floor(gl_FragCoord.xy), 2.0);
          // 2x2 ordered dither: thresholds 0, 0.5 / 0.75, 0.25. A full fade keeps one pixel in four.
          float threshold = cell.x == cell.y ? cell.x * 0.25 : cell.x * 0.5 + cell.y * 0.75;
          if (vFade * 0.7 > threshold + 0.01) discard;
        }`,
      );
  };
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
  const bounds = new Map<string, THREE.Box3>();
  /** For each entity, where its instances live: [fade attribute, instance index]. */
  const instances = new Map<string, Array<[THREE.InstancedBufferAttribute, number]>>();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const partBox = new THREE.Box3();

  for (const [key, parts] of batches) {
    const [primitive, color] = key.split("|") as [PrimitiveType, string];
    const geometry = createPrimitiveGeometry(primitive);
    geometry.computeBoundingBox();
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(parts.length), 1);
    fade.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aFade", fade);
    const material = new THREE.MeshLambertMaterial({ color });
    addInstanceFade(material);
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.name = `entities:${key}`;

    parts.forEach((part, index) => {
      const { position: p, rotation: r, scale: s } = part.transform;
      matrix.compose(position.set(p.x, p.y, p.z), quaternion.setFromEuler(euler.set(r.x, r.y, r.z)), scale.set(s.x, s.y, s.z));
      mesh.setMatrixAt(index, matrix);

      partBox.copy(geometry.boundingBox!).applyMatrix4(matrix);
      const entityBox = bounds.get(part.entityId);
      if (entityBox) entityBox.union(partBox);
      else bounds.set(part.entityId, partBox.clone());

      const list = instances.get(part.entityId);
      if (list) list.push([fade, index]);
      else instances.set(part.entityId, [[fade, index]]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.matrixAutoUpdate = false;
    disposables.push(geometry, material, mesh);
    group.add(mesh);
  }

  let faded: ReadonlySet<string> = new Set();

  return {
    group,
    bounds,
    setFaded(next) {
      let changed = false;
      const apply = (entityId: string, value: number) => {
        for (const [attribute, index] of instances.get(entityId) ?? []) {
          if (attribute.array[index] !== value) {
            attribute.array[index] = value;
            attribute.needsUpdate = true;
            changed = true;
          }
        }
      };
      for (const entityId of faded) if (!next.has(entityId)) apply(entityId, 0);
      for (const entityId of next) apply(entityId, 1);
      faded = new Set(next);
      return changed;
    },
    dispose() {
      disposables.forEach((item) => item.dispose());
      group.clear();
    },
  };
}
