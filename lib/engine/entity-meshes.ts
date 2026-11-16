import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { PlacedMapEntity, PrimitiveType, SerializableTransform } from "@/lib/maps/map-entities";
import { resolvePrefabInstance } from "@/lib/prefabs/prefab-resolver";
import { POP_COMPLETE, POP_DROP, POP_SECONDS, POP_TILT_X, POP_TILT_Z, popDelay, samplePop } from "./entry-sequence";
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
 *
 * Objects pop up when the visitor enters (see entry-sequence.ts). The pop is
 * one uniform for the whole layer: every instance carries its pivot and start
 * delay, and the vertex shader scales, drops and tilts it, so the animation
 * costs no CPU work per object and no extra draw calls.
 */
export type EntityLayer = {
  group: THREE.Group;
  /** World-space bounds per entity id. */
  bounds: ReadonlyMap<string, THREE.Box3>;
  /** Fades exactly the given entities. Returns true when anything changed. */
  setFaded: (entityIds: ReadonlySet<string>) => boolean;
  /** Advances animations. Returns true when something is animating and frames must keep coming. */
  update: (deltaSeconds: number) => boolean;
  /** Seconds since objects started popping up: negative hides them all, POP_COMPLETE shows them at rest. */
  setPopTime: (seconds: number) => void;
  /** Seconds from the first pop to the last object at rest. */
  popDuration: number;
  dispose: () => void;
};

type Batch = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Whether this layer created the geometry's buffers (primitives) or borrows them (models). */
  items: Array<{ entityId: string; matrix: THREE.Matrix4 }>;
};

export type EntityLayerOptions = {
  /** Where the pop wave starts (the loader platform), and the distance at which it is at its latest. */
  popOrigin?: { x: number; z: number };
  popRadius?: number;
};

/** The original's: half the diagonal of its 64 x 64 map. */
const DEFAULT_POP_RADIUS = 32 * Math.SQRT2;

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
 * Pop-up in the vertex shader: the instance is scaled about its pivot
 * (`aPop.xyz`), dropped and tilted, starting `aPop.w` seconds after
 * `uPopTime` 0. Same curve as `samplePop` in entry-sequence.ts.
 */
const POP_VERTEX = /* glsl */ `
  vec4 mvPosition = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  {
    float popProgress = clamp((uPopTime - aPop.w) / ${POP_SECONDS.toFixed(4)}, 0.0, 1.0);
    float eased = 1.0 - pow(1.0 - popProgress, 3.0);
    float bounce = sin(3.14159265 * popProgress) * (1.0 - popProgress);
    float rest = 1.0 - eased;
    vec3 offset = (mvPosition.xyz - aPop.xyz) * (0.001 + 0.999 * eased + bounce * 0.4);
    float tiltX = ${POP_TILT_X.toFixed(4)} * rest;
    float tiltZ = ${POP_TILT_Z.toFixed(4)} * rest;
    offset = vec3(offset.x, cos(tiltX) * offset.y - sin(tiltX) * offset.z, sin(tiltX) * offset.y + cos(tiltX) * offset.z);
    offset = vec3(cos(tiltZ) * offset.x - sin(tiltZ) * offset.y, sin(tiltZ) * offset.x + cos(tiltZ) * offset.y, offset.z);
    mvPosition.xyz = aPop.xyz + offset + vec3(0.0, -${POP_DROP.toFixed(4)} * rest + bounce * 0.18, 0.0);
  }
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
`;

/**
 * Adds the pop-up and a screen-door fade to a standard material, driven by
 * per-instance attributes. The fade discards pixels in a fixed pattern, which
 * keeps the material opaque (no sorting, no extra pass) while letting the
 * scene behind show through.
 */
function addInstanceEffects(material: THREE.Material, popTime: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPopTime = popTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFade;\nattribute vec4 aPop;\nuniform float uPopTime;\nvarying float vFade;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFade = aFade;")
      .replace("#include <project_vertex>", POP_VERTEX);
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

export function buildEntityLayer(entities: PlacedMapEntity[], models?: ModelLibrary | null, options: EntityLayerOptions = {}): EntityLayer {
  const popOrigin = options.popOrigin ?? { x: 0, z: 0 };
  const popRadius = options.popRadius ?? DEFAULT_POP_RADIUS;
  const popTime = { value: POP_COMPLETE };
  const delays = new Map<string, number>();
  const delayOf = (entity: PlacedMapEntity) => {
    let delay = delays.get(entity.id);
    if (delay === undefined) {
      const { x, z } = entity.transform.position;
      delay = popDelay(Math.hypot(x - popOrigin.x, z - popOrigin.z) / popRadius, entity.id);
      delays.set(entity.id, delay);
    }
    return delay;
  };
  const pivots = new Map<string, THREE.Vector3>();
  const group = new THREE.Group();
  group.name = "entities";
  const batches = new Map<string, Batch>();
  const disposables: Array<{ dispose: () => void }> = [];
  const bounds = new Map<string, THREE.Box3>();
  const mixers: THREE.AnimationMixer[] = [];
  /** Animated models are separate objects; their pop is applied to their matrix. */
  const animated: Array<{ holder: THREE.Group; rest: THREE.Matrix4; pivot: THREE.Vector3; delay: number }> = [];
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
    const { x, y, z } = entity.transform.position;
    animated.push({ holder, rest: holder.matrix.clone(), pivot: new THREE.Vector3(x, y, z), delay: delayOf(entity) });
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
    delayOf(entity);
    pivots.set(entity.id, new THREE.Vector3(entity.transform.position.x, entity.transform.position.y, entity.transform.position.z));
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
    const pop = new Float32Array(items.length * 4);
    items.forEach((item, index) => {
      const pivot = pivots.get(item.entityId)!;
      pop.set([pivot.x, pivot.y, pivot.z, delays.get(item.entityId) ?? 0], index * 4);
    });
    geometry.setAttribute("aPop", new THREE.InstancedBufferAttribute(pop, 4));
    addInstanceEffects(material, popTime);
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
  const popDuration = Math.max(0, ...delays.values()) + POP_SECONDS;
  const popMatrix = new THREE.Matrix4();
  const popRotation = new THREE.Euler();

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
    popDuration,
    setPopTime(seconds) {
      popTime.value = seconds;
      for (const item of animated) {
        const pop = samplePop(seconds, item.delay);
        // Same transform as the shader: about the pivot, then lifted.
        popMatrix.compose(
          scratchPosition.set(item.pivot.x, item.pivot.y + pop.lift, item.pivot.z),
          scratchQuaternion.setFromEuler(popRotation.set(pop.tiltX, 0, pop.tiltZ, "ZYX")),
          scratchScale.setScalar(pop.scale),
        );
        item.holder.matrix.copy(popMatrix).multiply(new THREE.Matrix4().makeTranslation(-item.pivot.x, -item.pivot.y, -item.pivot.z)).multiply(item.rest);
        item.holder.matrixWorldNeedsUpdate = true;
      }
    },
    dispose() {
      mixers.forEach((mixer) => mixer.stopAllAction());
      mixers.length = 0;
      disposables.forEach((item) => item.dispose());
      group.clear();
    },
  };
}
