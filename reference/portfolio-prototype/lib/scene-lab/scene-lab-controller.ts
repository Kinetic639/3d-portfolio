import * as THREE from "three";
import {
  getReferenceAsset,
  type ReferenceAssetId,
  type SceneLabInstanceMode,
  type Vector3Tuple,
} from "./reference-asset-registry";

export type SceneLabInstance = {
  id: string;
  assetId: ReferenceAssetId;
  mode: SceneLabInstanceMode;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
};

export type SceneLabTransformMode = "translate" | "rotate" | "scale";

export type SceneLabSnapshot = {
  revision: number;
  contentRevision: number;
  instances: readonly SceneLabInstance[];
  selectedId: string | null;
  pendingAssetId: ReferenceAssetId | null;
  transforming: boolean;
};

function cloneInstance(instance: SceneLabInstance): SceneLabInstance {
  return {
    ...instance,
    position: [...instance.position],
    rotation: [...instance.rotation],
    scale: [...instance.scale],
  };
}

export class SceneLabController {
  private readonly instances = new Map<string, SceneLabInstance>();
  private readonly objectReferences = new Map<string, THREE.Object3D>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private contentRevision = 0;
  private selectedId: string | null = null;
  private pendingAssetId: ReferenceAssetId | null = null;
  private transforming = false;
  private cursor = new THREE.Vector3(0, 0, 0);
  private idSequence = 0;
  private snapshot: SceneLabSnapshot = this.createSnapshot();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  getServerSnapshot = () => this.snapshot;

  getInstances() {
    return [...this.instances.values()].map(cloneInstance);
  }

  getInstance(id: string | null) {
    if (!id) return null;
    const instance = this.instances.get(id);
    return instance ? cloneInstance(instance) : null;
  }

  replaceInstances(instances: readonly SceneLabInstance[]) {
    this.instances.clear();
    for (const instance of instances) {
      this.instances.set(instance.id, cloneInstance(instance));
      this.captureSequence(instance.id);
    }
    this.selectedId = null;
    this.pendingAssetId = null;
    this.contentChanged();
  }

  replaceWithNewInstances(instances: readonly Omit<SceneLabInstance, "id">[]) {
    this.instances.clear();
    this.objectReferences.clear();
    this.selectedId = null;
    this.pendingAssetId = null;
    for (const instance of instances) {
      const next: SceneLabInstance = { ...cloneInstance({ ...instance, id: "pending" }), id: this.createId(instance.assetId) };
      this.instances.set(next.id, next);
    }
    this.contentChanged();
  }

  addInstance(instance: Omit<SceneLabInstance, "id">, select = true) {
    const next: SceneLabInstance = { ...cloneInstance({ ...instance, id: "pending" }), id: this.createId(instance.assetId) };
    this.instances.set(next.id, next);
    if (select) this.selectedId = next.id;
    this.contentChanged();
    return cloneInstance(next);
  }

  addInstances(instances: readonly Omit<SceneLabInstance, "id">[], selectLast = false) {
    let lastId: string | null = null;
    for (const instance of instances) {
      const next: SceneLabInstance = { ...cloneInstance({ ...instance, id: "pending" }), id: this.createId(instance.assetId) };
      this.instances.set(next.id, next);
      lastId = next.id;
    }
    if (selectLast) this.selectedId = lastId;
    this.contentChanged();
  }

  updateInstance(id: string, patch: Partial<Omit<SceneLabInstance, "id" | "assetId">>) {
    const current = this.instances.get(id);
    if (!current) return;
    this.instances.set(id, cloneInstance({ ...current, ...patch }));
    this.contentChanged();
  }

  commitObjectTransform(id: string) {
    const object = this.objectReferences.get(id);
    const current = this.instances.get(id);
    if (!object || !current) return;
    this.instances.set(id, {
      ...current,
      position: object.position.toArray(),
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
      scale: object.scale.toArray(),
    });
    this.contentChanged();
  }

  duplicateSelected() {
    const selected = this.getInstance(this.selectedId);
    if (!selected) return null;
    const offset = selected.assetId === "crow" ? 0.5 : 1;
    return this.addInstance({
      ...selected,
      position: [selected.position[0] + offset, selected.position[1], selected.position[2] + offset],
    });
  }

  deleteSelected() {
    if (!this.selectedId) return;
    const deleted = this.instances.delete(this.selectedId);
    this.objectReferences.delete(this.selectedId);
    this.selectedId = null;
    if (deleted) this.contentChanged();
  }

  clearAsset(assetId: ReferenceAssetId) {
    let changed = false;
    for (const [id, instance] of this.instances) {
      if (instance.assetId !== assetId) continue;
      this.instances.delete(id);
      this.objectReferences.delete(id);
      if (this.selectedId === id) this.selectedId = null;
      changed = true;
    }
    if (changed) this.contentChanged();
  }

  clearAll() {
    if (this.instances.size === 0) return;
    this.instances.clear();
    this.objectReferences.clear();
    this.selectedId = null;
    this.contentChanged();
  }

  select(id: string | null) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.changed();
  }

  beginPlacement(assetId: ReferenceAssetId) {
    this.pendingAssetId = assetId;
    this.changed();
  }

  cancelPlacement() {
    if (!this.pendingAssetId) return;
    this.pendingAssetId = null;
    this.changed();
  }

  consumePlacement(position: THREE.Vector3, mode: SceneLabInstanceMode) {
    const assetId = this.pendingAssetId;
    if (!assetId) return null;
    this.pendingAssetId = null;
    return this.spawnAt(assetId, mode, position);
  }

  spawnAt(assetId: ReferenceAssetId, mode: SceneLabInstanceMode, surfacePosition: THREE.Vector3) {
    const asset = getReferenceAsset(assetId);
    const resolvedMode = asset.assetType === "skinnedActor" ? "actor" : mode;
    return this.addInstance({
      assetId,
      mode: resolvedMode,
      position: [surfacePosition.x, surfacePosition.y + asset.defaults.groundOffset, surfacePosition.z],
      rotation: [...asset.defaults.rotation],
      scale: [...asset.defaults.scale],
    });
  }

  setCursor(position: THREE.Vector3) {
    this.cursor.copy(position);
  }

  getCursor() {
    return this.cursor.clone();
  }

  attachObject(id: string, object: THREE.Object3D | null) {
    if (object) this.objectReferences.set(id, object);
    else this.objectReferences.delete(id);
    if (this.selectedId === id) this.changed();
  }

  getSelectedObject() {
    return this.selectedId ? this.objectReferences.get(this.selectedId) ?? null : null;
  }

  setTransforming(transforming: boolean) {
    if (this.transforming === transforming) return;
    this.transforming = transforming;
    this.changed();
  }

  private createId(assetId: ReferenceAssetId) {
    this.idSequence += 1;
    return `${assetId}-${this.idSequence.toString().padStart(5, "0")}`;
  }

  private captureSequence(id: string) {
    const match = id.match(/-(\d+)$/);
    if (match) this.idSequence = Math.max(this.idSequence, Number(match[1]));
  }

  private contentChanged() {
    this.contentRevision += 1;
    this.changed();
  }

  private changed() {
    this.revision += 1;
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
  }

  private createSnapshot(): SceneLabSnapshot {
    return {
      revision: this.revision,
      contentRevision: this.contentRevision,
      instances: this.getInstances(),
      selectedId: this.selectedId,
      pendingAssetId: this.pendingAssetId,
      transforming: this.transforming,
    };
  }
}
