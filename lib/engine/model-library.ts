import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ASSET_PUBLIC_PATH, EMPTY_ASSET_MANIFEST, type AssetManifest, type AssetManifestEntry } from "@/lib/assets/asset-types";
import type { PlacedMapEntity } from "@/lib/maps/map-entities";

/**
 * Models available to the runtime and the editor: the manifest written by
 * `pnpm assets`, and the models loaded from it so far.
 *
 * Loading is explicit and asynchronous (`ensureLoaded`); everything else is
 * synchronous, so building the entity layer never waits. An entity whose
 * model is not loaded is drawn as a placeholder box.
 */
export type ModelPart = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Places the part in the model's normalised space: scaled to world units, anchor at the origin. */
  matrix: THREE.Matrix4;
};

export type LoadedModel = {
  entry: AssetManifestEntry;
  /** Static meshes, ready to be instanced. Empty for animated models. */
  parts: ModelPart[];
  /** The whole scene, for animated models, which are cloned per instance. */
  scene: THREE.Object3D;
  /** Brings `scene` into the model's normalised space. */
  normalise: THREE.Matrix4;
  /** The clip named in the model's metadata, if any. */
  clip: THREE.AnimationClip | null;
  /** Every clip of the model (creatures choose among them). */
  clips: THREE.AnimationClip[];
  /** Size in world units after normalisation. */
  size: THREE.Vector3;
};

export class ModelLibrary {
  readonly manifest: AssetManifest;
  private readonly entries = new Map<string, AssetManifestEntry>();
  private readonly prefabReplacements = new Map<string, AssetManifestEntry>();
  private readonly models = new Map<string, LoadedModel>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly failed = new Set<string>();
  private loader: GLTFLoader | null = null;

  constructor(manifest: AssetManifest = EMPTY_ASSET_MANIFEST) {
    this.manifest = manifest;
    for (const entry of manifest.assets) {
      this.entries.set(entry.id, entry);
      for (const prefabId of entry.replacesPrefabs) this.prefabReplacements.set(prefabId, entry);
    }
  }

  /** Reads the manifest. A missing manifest means there are no models, not an error. */
  static async fetch(signal?: AbortSignal): Promise<ModelLibrary> {
    try {
      const response = await fetch(`${ASSET_PUBLIC_PATH}/manifest.json`, { signal, cache: "no-cache" });
      if (!response.ok) return new ModelLibrary();
      return new ModelLibrary((await response.json()) as AssetManifest);
    } catch (error) {
      if (signal?.aborted) throw error;
      return new ModelLibrary();
    }
  }

  entry(id: string) {
    return this.entries.get(id) ?? null;
  }

  /** The model an entity is drawn with, or null when it is a primitive or an unreplaced prefab. */
  entryFor(entity: Pick<PlacedMapEntity, "entityType" | "assetReference" | "prefabId">): AssetManifestEntry | null {
    if (entity.entityType === "model") return entity.assetReference ? this.entry(entity.assetReference) : null;
    if (entity.entityType === "prefab" && entity.prefabId) return this.prefabReplacements.get(entity.prefabId) ?? null;
    return null;
  }

  /** Ids of the models a set of entities needs. */
  idsFor(entities: PlacedMapEntity[]) {
    const ids = new Set<string>();
    for (const entity of entities) {
      const entry = this.entryFor(entity);
      if (entry) ids.add(entry.id);
    }
    return [...ids];
  }

  get(id: string) {
    return this.models.get(id) ?? null;
  }

  /** Loads the named models. Resolves when each is loaded or has failed; failures are logged, not thrown. */
  async ensureLoaded(ids: Iterable<string>) {
    await Promise.all([...new Set(ids)].map((id) => {
      if (this.models.has(id) || this.failed.has(id)) return undefined;
      const entry = this.entries.get(id);
      if (!entry) return undefined;
      let task = this.pending.get(id);
      if (!task) {
        task = this.load(entry)
          .then((model) => {
            this.models.set(id, model);
          })
          .catch((error: unknown) => {
            this.failed.add(id);
            console.warn(`Model ${id} could not be loaded:`, error);
          })
          .finally(() => this.pending.delete(id));
        this.pending.set(id, task);
      }
      return task;
    }));
  }

  dispose() {
    for (const model of this.models.values()) {
      model.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
          material.dispose();
        }
      });
    }
    this.models.clear();
  }

  private async load(entry: AssetManifestEntry): Promise<LoadedModel> {
    if (!this.loader) {
      this.loader = new GLTFLoader();
      this.loader.setMeshoptDecoder(MeshoptDecoder);
    }
    const gltf = await this.loader.loadAsync(`${ASSET_PUBLIC_PATH}/${entry.file}`);
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);

    // Scale and turn first, then move the anchor to the origin.
    const base = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(entry.rotationY)).scale(new THREE.Vector3(entry.scale, entry.scale, entry.scale));
    // setFromObject measures skinned meshes in their bound pose, not by their raw vertex data,
    // which for rigged models is often stored at a different scale.
    const box = new THREE.Box3().setFromObject(scene).applyMatrix4(base);
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
    const centre = box.getCenter(new THREE.Vector3());
    const offset = new THREE.Matrix4().makeTranslation(-centre.x, entry.anchor === "bottom" ? -box.min.y : -centre.y, -centre.z);
    const normalise = new THREE.Matrix4().multiplyMatrices(offset, base);

    const clip = entry.animation ? gltf.animations.find((candidate) => candidate.name === entry.animation) ?? null : null;
    const parts: ModelPart[] = [];
    if (!clip) {
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        // A mesh with several materials is drawn once per material group; one material is the common case.
        parts.push({ geometry: mesh.geometry, material: materials[0], matrix: new THREE.Matrix4().multiplyMatrices(normalise, mesh.matrixWorld) });
      });
    }
    return { entry, parts, scene, normalise, clip, clips: gltf.animations, size: box.getSize(new THREE.Vector3()) };
  }
}

let shared: Promise<ModelLibrary> | null = null;

/** The page-wide library. The manifest is fetched once. */
export function getModelLibrary() {
  shared ??= ModelLibrary.fetch();
  return shared;
}

/** Drops the page-wide library so the next `getModelLibrary` reads the manifest again (after the editor rescans models). */
export function resetModelLibrary() {
  shared = null;
}
