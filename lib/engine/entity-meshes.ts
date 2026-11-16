import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { PlacedMapEntity, PrimitiveType, SerializableTransform } from "@/lib/maps/map-entities";
import { resolvePrefabInstance } from "@/lib/prefabs/prefab-resolver";
import type { LoadedModel, ModelLibrary } from "./model-library";

/**
 * Everything placed on a map, as renderable objects.
 *
 * - Procedural prefabs and primitives are instanced boxes, cylinders and
 *   spheres: one draw call per (shape, colour).
 * - Models from the asset pipeline are instanced too: one draw call per
 *   (model part, variant), however many times the model is placed.
 * - Animated models cannot be instanced; each instance is a clone with its
 *   own animation mixer.
 * - An entity whose model is missing or not loaded yet is a placeholder box.
 *
 * The layer also owns what interaction needs from objects: a bounding box
 * per entity and a per-entity "fade" switch used to see through objects that
 * hide something the visitor is looking at.
 */
export type EntityLayer = {
  group: THREE.Group;
  /** World-space bounds per entity id. */
  bounds: ReadonlyMap<string, THREE.Box3>;
  /** Fades exactly the given entities. Returns true when anything changed. */
  setFaded: (entityIds: ReadonlySet<string>) => boolean;
  /** Advances animations. Returns true when something is animating and frames must keep coming. */
  update: (deltaSeconds: number) => boolean;
  dispose: () => void;
};

type Batch = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Whether this layer created the geometry's buffers (primitives) or borrows them (models). */
  items: Array<{ entityId: string; matrix: THREE.Matrix4 }>;
};

const ANCHOR_OFFSET: Record<PrimitiveType, number> = { box: 0.5, cylinder: 0.5, sphere: 0.5, plane: 0.02, platform: 0.11, sign: 0.36 };
const MISSING_MODEL_COLOR = "#c04fd0";

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

const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchScale = new THREE.Vector3();

function composeMatrix(transform: SerializableTransform, extraScale = 1) {
  const { position: p, rotation: r, scale: s } = transform;
  return new THREE.Matrix4().compose(
    scratchPosition.set(p.x, p.y, p.z),
    scratchQuaternion.setFromEuler(scratchEuler.set(r.x, r.y, r.z)),
    scratchScale.set(s.x * extraScale, s.y * extraScale, s.z * extraScale),
  );
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

/** A geometry that draws another geometry's buffers, so per-layer attributes can be added without touching the original. */
function borrowGeometry(source: THREE.BufferGeometry) {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(source.index);
  if (!source.boundingBox) source.computeBoundingBox();
  geometry.boundingBox = source.boundingBox!.clone();
  return geometry;
}

export function buildEntityLayer(entities: PlacedMapEntity[], models?: ModelLibrary | null): EntityLayer {
  const group = new THREE.Group();
  group.name = "entities";
  const batches = new Map<string, Batch>();
  const disposables: Array<{ dispose: () => void }> = [];
  const bounds = new Map<string, THREE.Box3>();
  const mixers: THREE.AnimationMixer[] = [];
  const partBox = new THREE.Box3();

  const grow = (entityId: string, box: THREE.Box3) => {
    const existing = bounds.get(entityId);
    if (existing) existing.union(box);
    else bounds.set(entityId, box.clone());
  };

  const addToBatch = (key: string, entityId: string, matrix: THREE.Matrix4, create: () => Pick<Batch, "geometry" | "material">) => {
    let batch = batches.get(key);
    if (!batch) {
      batch = { ...create(), items: [] };
      batches.set(key, batch);
    }
    batch.items.push({ entityId, matrix });
  };

  const addPrimitive = (entityId: string, primitive: PrimitiveType, color: string, transform: SerializableTransform) => {
    addToBatch(`${primitive}|${color.toLowerCase()}`, entityId, composeMatrix(transform), () => ({
      geometry: createPrimitiveGeometry(primitive),
      // Unlit flat colour, as the placeholders have always been drawn.
      material: new THREE.MeshBasicMaterial({ color }),
    }));
  };

  const addStaticModel = (entity: PlacedMapEntity, model: LoadedModel, scale: number, tint: string | undefined) => {
    const entityMatrix = composeMatrix(entity.transform, scale);
    model.parts.forEach((part, index) => {
      addToBatch(`model|${model.entry.id}|${index}|${tint ?? ""}`, entity.id, new THREE.Matrix4().multiplyMatrices(entityMatrix, part.matrix), () => {
        const material = part.material.clone();
        const colored = material as THREE.MeshStandardMaterial;
        if (tint && colored.color) colored.color.multiply(new THREE.Color(tint));
        return { geometry: borrowGeometry(part.geometry), material };
      });
    });
  };

  const addAnimatedModel = (entity: PlacedMapEntity, model: LoadedModel, scale: number) => {
    const instance = cloneSkinned(model.scene);
    const holder = new THREE.Group();
    holder.name = `entity:${entity.id}`;
    holder.add(instance);
    holder.matrixAutoUpdate = false;
    holder.matrix.multiplyMatrices(composeMatrix(entity.transform, scale), model.normalise);
    instance.traverse((object) => {
      // Skinned meshes move outside their rest bounds; culling them by those bounds makes them vanish.
      object.frustumCulled = false;
      const skinned = object as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh) disposables.push(skinned.skeleton);
    });
    const mixer = new THREE.AnimationMixer(instance);
    mixer.clipAction(model.clip!).play();
    // Pose the first frame now, so the model is not in its bind pose until the first update.
    mixer.update(0);
    mixers.push(mixer);
    group.add(holder);

    const anchorBottom = model.entry.anchor === "bottom";
    partBox.set(
      new THREE.Vector3(-model.size.x / 2, anchorBottom ? 0 : -model.size.y / 2, -model.size.z / 2),
      new THREE.Vector3(model.size.x / 2, anchorBottom ? model.size.y : model.size.y / 2, model.size.z / 2),
    ).applyMatrix4(composeMatrix(entity.transform, scale));
    grow(entity.id, partBox);
  };

  for (const entity of entities) {
    if (!entity.appearance.visibleAtRuntime) continue;
    const entry = models?.entryFor(entity) ?? null;
    const model = entry ? models!.get(entry.id) : null;

    if (model) {
      const variant = model.entry.variants.find((candidate) => candidate.id === entity.variantId);
      if (model.clip) addAnimatedModel(entity, model, variant?.scale ?? 1);
      else addStaticModel(entity, model, variant?.scale ?? 1, variant?.tint);
      continue;
    }
    if (entity.entityType === "model") {
      // The model is unknown, failed to load, or has not been loaded yet: show where it stands.
      const { width, depth, height } = entity.footprint;
      addPrimitive(entity.id, "box", MISSING_MODEL_COLOR, {
        position: { x: entity.transform.position.x, y: entity.transform.position.y + height / 2, z: entity.transform.position.z },
        rotation: entity.transform.rotation,
        scale: { x: width, y: height, z: depth },
      });
      continue;
    }
    if (entity.entityType === "prefab") {
      for (const part of resolvePrefabInstance(entity).parts) addPrimitive(entity.id, part.primitive, part.color, part.transform);
      continue;
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
    addPrimitive(entity.id, entity.primitiveType, entity.appearance.color, transform);
  }

  /** For each entity, where its instances live: [fade attribute, instance index]. */
  const instances = new Map<string, Array<[THREE.InstancedBufferAttribute, number]>>();
  for (const [key, batch] of batches) {
    const { geometry, material, items } = batch;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(items.length), 1);
    fade.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aFade", fade);
    addInstanceFade(material);
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.name = `entities:${key}`;

    items.forEach((item, index) => {
      mesh.setMatrixAt(index, item.matrix);
      grow(item.entityId, partBox.copy(geometry.boundingBox!).applyMatrix4(item.matrix));
      const list = instances.get(item.entityId);
      if (list) list.push([fade, index]);
      else instances.set(item.entityId, [[fade, index]]);
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
    update(deltaSeconds) {
      for (const mixer of mixers) mixer.update(deltaSeconds);
      return mixers.length > 0;
    },
    dispose() {
      mixers.forEach((mixer) => mixer.stopAllAction());
      mixers.length = 0;
      disposables.forEach((item) => item.dispose());
      group.clear();
    },
  };
}
