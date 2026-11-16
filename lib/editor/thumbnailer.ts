import * as THREE from "three";
import type { LibraryItem } from "@/lib/assets/library";
import { buildEntityLayer } from "@/lib/engine/entity-meshes";
import type { ModelLibrary } from "@/lib/engine/model-library";
import { createPlacedEntity } from "@/lib/maps/map-entities";
import { createPrefabEntityFromDraft } from "./entity-authoring";

/**
 * Renders library items to small images for the editor's object picker.
 *
 * Thumbnails are drawn in the browser with the same code that draws objects
 * in the world, so they cannot drift from what gets placed, and nothing has
 * to be generated or committed. One hidden renderer is shared; requests are
 * served one per frame so a long list does not stall the editor.
 */
const SIZE = 112;
const ORIGIN = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };

export class Thumbnailer {
  private readonly models: ModelLibrary;
  private readonly cache = new Map<string, Promise<string>>();
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, 1, 0.05, 500);
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(models: ModelLibrary) {
    this.models = models;
    const sun = new THREE.DirectionalLight("#ffffff", 2.2);
    sun.position.set(3, 6, 4);
    this.scene.add(sun, new THREE.HemisphereLight("#ffffff", "#6b6257", 1.1));
  }

  /** A data URL for the item's picture. Cached per item and revision. */
  render(item: LibraryItem): Promise<string> {
    const key = `${item.key}:${item.revision}`;
    let task = this.cache.get(key);
    if (!task) {
      task = this.enqueue(() => this.draw(item));
      this.cache.set(key, task);
    }
    return task;
  }

  dispose() {
    this.disposed = true;
    this.renderer?.dispose();
    this.renderer = null;
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => new Promise((resolve) => requestAnimationFrame(resolve))).then(job);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async draw(item: LibraryItem): Promise<string> {
    if (this.disposed) return "";
    const modelId = item.kind === "model" ? item.id : item.replacedBy;
    if (modelId) await this.models.ensureLoaded([modelId]);
    if (this.disposed) return "";

    const entity = item.kind === "model"
      ? createPlacedEntity({ id: "thumbnail", entityType: "model", assetReference: item.id, variantId: item.defaultVariantId ?? undefined, transform: ORIGIN })
      : createPrefabEntityFromDraft({ prefabId: item.id, variantId: item.defaultVariantId ?? "", name: item.name, transform: ORIGIN }, new Set());
    const layer = buildEntityLayer([entity], this.models);
    layer.update(0);
    const box = layer.bounds.get(entity.id) ?? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const distance = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov) / 2)) * 1.05;
    this.camera.position.copy(sphere.center).add(new THREE.Vector3(0.75, 0.62, 1).normalize().multiplyScalar(distance));
    this.camera.lookAt(sphere.center);

    this.renderer ??= this.createRenderer();
    this.scene.add(layer.group);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL("image/png");
    this.scene.remove(layer.group);
    layer.dispose();
    return url;
  }

  private createRenderer() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    return renderer;
  }
}
