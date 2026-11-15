import * as THREE from "three";
import type { QualityTier, WorldBridge, WorldCommand } from "@/lib/bridge/world-bridge";
import { createLoadedMapState, type MapContentReference, type MapDefinition } from "@/lib/maps/map-definition";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import { CameraRig } from "./camera-rig";
import { buildEntityLayer, type EntityLayer } from "./entity-meshes";
import { Environment } from "./environment";
import { InteractionLayer, type Interactable } from "./interactables";
import { buildVoxelTerrain, type TerrainSource } from "./terrain-meshes";

/**
 * The 3D runtime. Plain TypeScript on three.js: no React anywhere in this
 * folder. The page talks to it only through the `WorldBridge`.
 *
 * Rendering is on demand. A frame is drawn when something invalidates the
 * view (camera motion, a resize, a hover change), so an idle world costs no
 * CPU or GPU time at all.
 */
export type EngineStats = {
  /** Frames drawn since the engine started. */
  frames: number;
  /** Hover picks performed since the engine started. */
  picks: number;
  /** CPU time of the last frame's update + render, ms. */
  frameCpuMs: number;
  /** Time since the previous frame, ms. Only meaningful while frames are continuous. */
  frameIntervalMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
};

export type LoadMapOptions = {
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  /** Display title for a content reference, or null if it does not exist. Without it nothing is interactive. */
  describeContent?: (reference: MapContentReference) => string | null;
};

const PIXEL_RATIO_CAP: Record<QualityTier, number> = { low: 1, medium: 1.25, high: 1.5 };
const FOCUS_DISTANCE = 38;

export class WorldEngine {
  readonly stats: EngineStats = { frames: 0, picks: 0, frameCpuMs: 0, frameIntervalMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 };
  private readonly canvas: HTMLCanvasElement;
  private readonly bridge: WorldBridge;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly environment: Environment;
  private readonly rig: CameraRig;
  private readonly resizeObserver: ResizeObserver;
  private readonly cleanup: Array<() => void> = [];
  private world: VoxelWorld | null = null;
  private terrain: TerrainSource | null = null;
  private entities: EntityLayer | null = null;
  private interaction: InteractionLayer | null = null;
  private frameHandle = 0;
  private pickHandle = 0;
  private pointer: { x: number; y: number } | null = null;
  private viewBeforeFocus: { x: number; z: number; distance: number } | null = null;
  private lastFrameAt = 0;
  private lastTickAt = 0;
  private elapsedSeconds = 0;
  private disposed = false;

  static isSupported() {
    try {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("webgl2"));
    } catch {
      return false;
    }
  }

  constructor(canvas: HTMLCanvasElement, bridge: WorldBridge) {
    this.canvas = canvas;
    this.bridge = bridge;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", alpha: false });
    this.environment = new Environment(this.scene);
    this.rig = new CameraRig(canvas, {
      onChange: () => this.invalidate(),
      onTap: (clientX, clientY) => this.handleTap(clientX, clientY),
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    const listen = <K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
      canvas.addEventListener(type, handler);
      this.cleanup.push(() => canvas.removeEventListener(type, handler));
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      this.bridge.set({ phase: "unavailable", error: "The graphics context was lost." });
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    this.cleanup.push(() => canvas.removeEventListener("webglcontextlost", onContextLost));
    listen("pointermove", (event) => {
      // Touch has no hover; a tap picks directly.
      if (event.pointerType === "touch") return;
      this.pointer = { x: event.clientX, y: event.clientY };
      this.schedulePick();
    });
    listen("pointerleave", () => {
      this.pointer = null;
      this.schedulePick();
    });
    this.cleanup.push(bridge.commands.subscribe((command) => this.handleCommand(command)));
  }

  /** Builds everything a map needs. Resolves once the scene can be rendered. */
  async loadMap(definition: MapDefinition, options: LoadMapOptions = {}) {
    this.unloadMap();
    const { world, definition: map } = createLoadedMapState(definition);
    const terrain = await buildVoxelTerrain(world, options);
    if (this.disposed || options.signal?.aborted) {
      terrain.dispose();
      return;
    }

    this.world = world;
    this.terrain = terrain;
    this.entities = buildEntityLayer(map.entities);
    this.interaction = new InteractionLayer({
      map,
      world,
      entities: this.entities,
      describeContent: options.describeContent ?? (() => null),
    });
    this.scene.add(terrain.group, this.entities.group, this.interaction.group);
    this.environment.apply(map.environment);

    // The camera may only centre on the playable area; backdrop scenery stays out of reach.
    const min = world.gridToWorld(map.playableBounds.minX, 0, map.playableBounds.minZ);
    const max = world.gridToWorld(map.playableBounds.maxX, 0, map.playableBounds.maxZ);
    const margin = 6;
    this.rig.setBounds({ minX: min.x + margin, maxX: max.x - margin, minZ: min.z + margin, maxZ: max.z - margin });
    const spawn = map.spawnPoints.find((candidate) => candidate.id === map.defaultSpawnId) ?? map.spawnPoints[0];
    const focus = spawn
      ? world.gridToWorld(spawn.cameraTarget?.x ?? spawn.position.x, 0, spawn.cameraTarget?.z ?? spawn.position.z)
      : { x: (min.x + max.x) / 2, z: (min.z + max.z) / 2 };
    this.rig.lookAt(focus.x, focus.z, undefined, true);
    this.invalidate();
  }

  /** Compiles every shader the current scene needs, off the critical path. */
  async compile() {
    await this.renderer.compileAsync(this.scene, this.rig.camera);
  }

  setInputEnabled(enabled: boolean) {
    this.rig.setEnabled(enabled);
  }

  /** Requests one more frame. Cheap and idempotent. */
  invalidate() {
    if (this.disposed || this.frameHandle !== 0) return;
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    cancelAnimationFrame(this.pickHandle);
    this.frameHandle = this.pickHandle = 0;
    this.resizeObserver.disconnect();
    this.cleanup.forEach((stop) => stop());
    this.rig.dispose();
    this.unloadMap();
    this.renderer.dispose();
  }

  private unloadMap() {
    if (this.terrain) {
      this.scene.remove(this.terrain.group);
      this.terrain.dispose();
      this.terrain = null;
    }
    if (this.interaction) {
      this.scene.remove(this.interaction.group);
      this.interaction.dispose();
      this.interaction = null;
    }
    if (this.entities) {
      this.scene.remove(this.entities.group);
      this.entities.dispose();
      this.entities = null;
    }
    this.world = null;
    this.viewBeforeFocus = null;
    this.bridge.set({ hovered: null });
  }

  private handleCommand(command: WorldCommand) {
    switch (command.type) {
      case "set-quality":
        this.bridge.set({ quality: command.quality });
        this.resize();
        break;
      case "focus-content": {
        const item = this.interaction?.findByContent(command.content) ?? null;
        if (!item) {
          // Content with no place on this map: the panel still opens, the camera stays put.
          this.interaction?.setFocused(null);
          break;
        }
        // Remember where the visitor was only for the first focus in a row.
        this.viewBeforeFocus ??= this.rig.getView();
        this.interaction?.setFocused(item.id);
        this.rig.focusOn(item.focus.x, item.focus.z, Math.min(this.rig.getView().distance, FOCUS_DISTANCE), command.inset);
        this.invalidate();
        break;
      }
      case "clear-focus":
        this.interaction?.setFocused(null);
        if (this.viewBeforeFocus) {
          this.rig.lookAt(this.viewBeforeFocus.x, this.viewBeforeFocus.z, this.viewBeforeFocus.distance);
          this.viewBeforeFocus = null;
        }
        this.invalidate();
        break;
      default:
        break;
    }
  }

  private isInteractive() {
    return this.bridge.store.getState().phase === "world" && this.interaction !== null;
  }

  private pickAt(clientX: number, clientY: number): Interactable | null {
    if (!this.interaction) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    this.stats.picks += 1;
    return this.interaction.pick(
      this.rig.camera,
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  /** Coalesces pointer moves: at most one pick per animation frame, and no render unless the result changed. */
  private schedulePick() {
    if (this.disposed || this.pickHandle !== 0) return;
    this.pickHandle = requestAnimationFrame(() => {
      this.pickHandle = 0;
      this.updateHover();
    });
  }

  private updateHover() {
    if (!this.interaction) return;
    const canHover = this.isInteractive() && this.pointer !== null && !this.rig.isPointerDown();
    const item = canHover ? this.pickAt(this.pointer!.x, this.pointer!.y) : null;
    if (!this.interaction.setHovered(item?.id ?? null)) return;
    this.canvas.style.cursor = item ? "pointer" : "";
    this.bridge.set({ hovered: item ? { id: item.id, label: item.label, content: item.content } : null });
    this.invalidate();
  }

  private handleTap(clientX: number, clientY: number) {
    if (!this.isInteractive()) return;
    const item = this.pickAt(clientX, clientY);
    if (item) {
      this.bridge.events.emit({ type: "content-activated", content: item.content, interactableId: item.id });
    }
  }

  private readonly frame = (now: number) => {
    this.frameHandle = 0;
    if (this.disposed) return;
    const startedAt = performance.now();
    // Clamp: after an idle gap the first frame must not see a huge time step.
    const delta = this.lastTickAt > 0 ? Math.min((now - this.lastTickAt) / 1000, 0.1) : 1 / 60;
    this.lastTickAt = now;
    this.elapsedSeconds += delta;
    const cameraMoving = this.rig.update(delta);
    this.environment.update(this.elapsedSeconds);
    if (this.interaction) {
      this.rig.camera.updateMatrixWorld();
      this.interaction.updateOccluders(this.rig.camera);
    }
    this.renderer.render(this.scene, this.rig.camera);

    const info = this.renderer.info;
    this.stats.frames += 1;
    this.stats.frameCpuMs = performance.now() - startedAt;
    this.stats.frameIntervalMs = this.lastFrameAt > 0 ? now - this.lastFrameAt : 0;
    this.stats.drawCalls = info.render.calls;
    this.stats.triangles = info.render.triangles;
    this.stats.geometries = info.memory.geometries;
    this.stats.textures = info.memory.textures;
    this.stats.programs = info.programs?.length ?? 0;
    this.lastFrameAt = cameraMoving ? now : 0;

    if (cameraMoving) {
      this.invalidate();
    } else {
      // The loop stops here; the next frame after an idle gap starts a fresh time step.
      this.lastTickAt = 0;
      // The world moved under a resting pointer: what it hovers may have changed.
      if (this.pointer) this.schedulePick();
    }
  };

  private resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    const quality = this.bridge.store.getState().quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP[quality]));
    this.renderer.setSize(width, height, false);
    this.rig.setAspect(width / height);
    this.invalidate();
  }
}
