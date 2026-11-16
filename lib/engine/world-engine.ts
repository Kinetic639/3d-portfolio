import * as THREE from "three";
import type { QualityTier, WorldBridge, WorldCommand } from "@/lib/bridge/world-bridge";
import { decodeBakedWorld, type RuntimeMap } from "@/lib/bake/baked-format";
import type { MapContentReference, MapDefinition } from "@/lib/maps/map-definition";
import { createBakedQuery, createBakedTerrain } from "./baked-terrain";
import { CameraRig, VISITOR_CAMERA } from "./camera-rig";
import { buildEntityLayer, type EntityLayer } from "./entity-meshes";
import { Environment } from "./environment";
import { InteractionLayer, type Interactable } from "./interactables";
import { getModelLibrary, type ModelLibrary } from "./model-library";
import { getTerrainAtlas } from "./terrain-material";
import { buildWorldForMap, type TerrainSource } from "./terrain-meshes";
import { createVoxelWorldQuery, type WorldQuery } from "./world-query";

/**
 * The 3D runtime. Plain TypeScript on three.js: no React anywhere in this
 * folder. The page talks to it only through the `WorldBridge`.
 *
 * Lifecycle: construct -> `loadMap` -> `warmUp` -> (enter <-> exit)*.
 * Until the visitor enters, the engine is *inactive*: it draws nothing on its
 * own and ignores input. While active, rendering is on demand: a frame is
 * drawn only when something invalidates the view, so an idle world costs no
 * CPU or GPU time.
 */
export type EngineStats = {
  /** Frames drawn since the engine started (warm-up frames excluded). */
  frames: number;
  /** Hover picks performed since the engine started. */
  picks: number;
  /** CPU time of the last frame's update + render, ms. */
  frameCpuMs: number;
  /** Time since the previous frame, ms. Only meaningful while frames are continuous. */
  frameIntervalMs: number;
  /** Longest interval between two consecutive frames since the last `resetFramePacing()`, ms. */
  worstFrameIntervalMs: number;
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

export type WarmUpReport = {
  /** True when the measured pass stayed in budget and created no GPU resources. */
  ok: boolean;
  durationMs: number;
  quality: QualityTier;
  programs: number;
  geometries: number;
  textures: number;
  /** Frames spent uploading buffers, each kept short. */
  uploadFrames: number;
  /** Frames rendered along the entry path in the measured pass. */
  testFrames: number;
  medianFrameMs: number;
  maxFrameMs: number;
  /** Programs + geometries + textures that appeared during the measured pass. Must be 0. */
  newResourcesDuringTest: number;
};

const PIXEL_RATIO_CAP: Record<QualityTier, number> = { low: 1, medium: 1.25, high: 1.5 };
const LOWER_QUALITY: Record<QualityTier, QualityTier | null> = { high: "medium", medium: "low", low: null };
const FOCUS_DISTANCE = 38;
/** Where the entry transition starts from; beyond the zoom limit, inside the fog. */
const APPROACH_DISTANCE = 150;
const APPROACH_SECONDS = 1.6;
const LEAVE_MS = 450;
/** A warm frame (CPU + GPU, forced to finish) must fit comfortably inside a 60 Hz frame. */
const WARM_FRAME_BUDGET_MS = 10;
/** Longest single slice of warm-up work per animation frame. */
const WARM_SLICE_MS = 6;

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

export class WorldEngine {
  readonly stats: EngineStats = { frames: 0, picks: 0, frameCpuMs: 0, frameIntervalMs: 0, worstFrameIntervalMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 };
  warmUpReport: WarmUpReport | null = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly bridge: WorldBridge;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly environment: Environment;
  private readonly rig: CameraRig;
  private readonly rehearsalCamera = new THREE.PerspectiveCamera();
  private readonly resizeObserver: ResizeObserver;
  private readonly cleanup: Array<() => void> = [];
  private terrain: TerrainSource | null = null;
  private entities: EntityLayer | null = null;
  private interaction: InteractionLayer | null = null;
  private active = false;
  private entering = false;
  private leaveTimer = 0;
  private frameHandle = 0;
  private pickHandle = 0;
  private pointer: { x: number; y: number } | null = null;
  private viewBeforeFocus: ReturnType<CameraRig["getGoal"]> | null = null;
  private lastFrameAt = 0;
  private lastTickAt = 0;
  private elapsedSeconds = 0;
  private disposed = false;

  /**
   * `context` is a WebGL 2 context already created on `canvas`. The caller
   * creates it so that a missing WebGL can be handled quietly before any
   * engine code runs.
   */
  constructor(canvas: HTMLCanvasElement, bridge: WorldBridge, context: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.bridge = bridge;
    this.renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false });
    this.environment = new Environment(this.scene);
    this.rig = new CameraRig(canvas, {
      ...VISITOR_CAMERA,
      onChange: () => this.invalidate(),
      onTap: (clientX, clientY) => this.handleTap(clientX, clientY),
    });
    this.rig.setEnabled(false);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    const onContextLost = (event: Event) => {
      event.preventDefault();
      this.bridge.set({ phase: "unavailable", error: "The graphics context was lost." });
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    this.cleanup.push(() => canvas.removeEventListener("webglcontextlost", onContextLost));

    const listen = <K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
      canvas.addEventListener(type, handler);
      this.cleanup.push(() => canvas.removeEventListener(type, handler));
    };
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

  /**
   * Loads a map from its voxels: the unbaked path, used for maps without a
   * current bake. The voxel world is built and meshed in a worker.
   */
  async loadMap(definition: MapDefinition, options: LoadMapOptions = {}) {
    this.unloadMap();
    // The terrain textures are part of the world: loaded before it is shown, so warm-up uploads them.
    const [{ world, terrain }, models] = await Promise.all([buildWorldForMap(definition, options), this.loadModels(definition), getTerrainAtlas().ready]);
    if (this.disposed || options.signal?.aborted) {
      terrain.dispose();
      return;
    }
    this.install(definition, terrain, createVoxelWorldQuery(world), models, options);
  }

  /** Loads a baked world file: static geometry, no voxel data, nothing to build. */
  async loadBaked(file: ArrayBuffer, options: LoadMapOptions = {}) {
    this.unloadMap();
    const baked = decodeBakedWorld(file);
    const models = await this.loadModels(baked.header.map);
    if (this.disposed || options.signal?.aborted) return;
    this.install(baked.header.map, createBakedTerrain(baked), createBakedQuery(baked), models, options);
    options.onProgress?.(1);
  }

  /** The models the map's objects use, loaded before the map is shown so warm-up covers them. */
  private async loadModels(definition: RuntimeMap) {
    const models = await getModelLibrary();
    await models.ensureLoaded(models.idsFor(definition.entities));
    return models;
  }

  private install(definition: RuntimeMap, terrain: TerrainSource, query: WorldQuery, models: ModelLibrary, options: LoadMapOptions) {
    this.terrain = terrain;
    this.entities = buildEntityLayer(definition.entities, models);
    this.interaction = new InteractionLayer({
      map: definition,
      query,
      entities: this.entities,
      describeContent: options.describeContent ?? (() => null),
    });
    this.scene.add(terrain.group, this.entities.group, this.interaction.group);
    this.environment.apply(definition.environment);

    // The camera may only centre on the playable area; backdrop scenery stays out of reach.
    const min = query.cellToWorld(definition.playableBounds.minX, 0, definition.playableBounds.minZ);
    const max = query.cellToWorld(definition.playableBounds.maxX, 0, definition.playableBounds.maxZ);
    const margin = 6;
    this.rig.setBounds({ minX: min.x + margin, maxX: max.x - margin, minZ: min.z + margin, maxZ: max.z - margin });
    const spawn = definition.spawnPoints.find((candidate) => candidate.id === definition.defaultSpawnId) ?? definition.spawnPoints[0];
    const focus = spawn
      ? query.cellToWorld(spawn.cameraTarget?.x ?? spawn.position.x, 0, spawn.cameraTarget?.z ?? spawn.position.z)
      : { x: (min.x + max.x) / 2, z: (min.z + max.z) / 2 };
    this.rig.lookAt(focus.x, focus.z, undefined, true);
  }

  /**
   * Prepares the GPU so that entering the world loads, compiles and uploads
   * nothing. Work is spread over animation frames in slices of a few
   * milliseconds, so the page in front keeps its frame rate.
   *
   * 1. Compile every shader program the scene uses.
   * 2. Upload every vertex buffer and texture by drawing each object once
   *    into a one-pixel scissor (same programs as real frames, no fill cost).
   * 3. Rehearse the entry: render the views the transition will pass
   *    through, twice. The first pass absorbs one-off costs; the second is
   *    measured and must stay in budget without creating any GPU resource.
   *    If it is too slow, the quality tier drops and the rehearsal repeats.
   */
  async warmUp(options: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {}): Promise<WarmUpReport | null> {
    const startedAt = performance.now();
    const aborted = () => this.disposed || options.signal?.aborted === true;
    const gl = this.renderer.getContext();
    const camera = this.rig.camera;
    const renderSync = (view: THREE.Camera) => {
      const begin = performance.now();
      this.renderer.render(this.scene, view);
      // Without finish() the GPU work would be deferred and the timing meaningless.
      gl.finish();
      return performance.now() - begin;
    };

    await this.renderer.compileAsync(this.scene, camera);
    if (aborted()) return null;
    options.onProgress?.(0.2);

    // Step 2: uploads.
    const objects: THREE.Object3D[] = [
      ...(this.terrain?.meshes() ?? []),
      ...(this.entities?.group.children ?? []),
      ...(this.interaction?.group.children ?? []),
    ];
    const culling = objects.map((object) => object.frustumCulled);
    objects.forEach((object) => {
      object.visible = false;
      object.frustumCulled = false;
    });
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(0, 0, 1, 1);
    let uploadFrames = 0;
    let batchSize = 4;
    try {
      for (let index = 0; index < objects.length;) {
        await nextFrame();
        if (aborted()) return null;
        const batch = objects.slice(index, index + batchSize);
        batch.forEach((object) => { object.visible = true; });
        const elapsed = renderSync(camera);
        batch.forEach((object) => { object.visible = false; });
        index += batch.length;
        uploadFrames += 1;
        if (elapsed > WARM_SLICE_MS) batchSize = Math.max(1, Math.floor(batchSize / 2));
        else if (elapsed < WARM_SLICE_MS / 2) batchSize = Math.min(32, batchSize * 2);
        options.onProgress?.(0.2 + 0.5 * (index / objects.length));
      }
    } finally {
      this.renderer.setScissorTest(false);
      objects.forEach((object, index) => {
        object.visible = true;
        object.frustumCulled = culling[index];
      });
    }

    // Step 3: rehearsal.
    const goal = this.rig.getGoal();
    const distances: number[] = [];
    for (let step = 0; step <= 9; step += 1) {
      // Same curve as the real approach (ease-out cubic): fast at first, slow near the end.
      distances.push(goal.distance + (APPROACH_DISTANCE - goal.distance) * Math.pow(1 - step / 9, 3));
    }
    distances.push(goal.distance, goal.distance, goal.distance);
    const resourceCount = () => (this.renderer.info.programs?.length ?? 0) + this.renderer.info.memory.geometries + this.renderer.info.memory.textures;
    const rehearse = async () => {
      const times: number[] = [];
      for (const distance of distances) {
        await nextFrame();
        if (aborted()) return null;
        times.push(renderSync(this.rig.poseAt(distance, this.rehearsalCamera)));
      }
      return times;
    };

    let report: WarmUpReport | null = null;
    for (;;) {
      if (!(await rehearse())) return null;
      const before = resourceCount();
      const times = await rehearse();
      if (!times) return null;
      const sorted = [...times].sort((left, right) => left - right);
      const quality = this.bridge.store.getState().quality;
      report = {
        ok: sorted[sorted.length - 1] <= WARM_FRAME_BUDGET_MS && resourceCount() === before,
        durationMs: performance.now() - startedAt,
        quality,
        programs: this.renderer.info.programs?.length ?? 0,
        geometries: this.renderer.info.memory.geometries,
        textures: this.renderer.info.memory.textures,
        uploadFrames,
        testFrames: times.length,
        medianFrameMs: sorted[sorted.length >> 1],
        maxFrameMs: sorted[sorted.length - 1],
        newResourcesDuringTest: resourceCount() - before,
      };
      const lower = LOWER_QUALITY[quality];
      if (report.maxFrameMs <= WARM_FRAME_BUDGET_MS || !lower) break;
      // Too slow for this device: render fewer pixels and measure again.
      this.bridge.set({ quality: lower });
      this.resize();
    }
    options.onProgress?.(1);
    this.warmUpReport = report;
    return report;
  }

  /** Requests one more frame. Cheap and idempotent; ignored while the world is not shown. */
  invalidate() {
    if (this.disposed || !this.active || this.frameHandle !== 0) return;
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  resetFramePacing() {
    this.stats.worstFrameIntervalMs = 0;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    cancelAnimationFrame(this.pickHandle);
    window.clearTimeout(this.leaveTimer);
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
    this.viewBeforeFocus = null;
    this.bridge.set({ hovered: null });
  }

  private handleCommand(command: WorldCommand) {
    switch (command.type) {
      case "enter":
        this.enter(command);
        break;
      case "exit":
        this.exit(command.reducedMotion === true);
        break;
      case "set-quality":
        this.bridge.set({ quality: command.quality });
        this.resize();
        break;
      case "focus-content":
        this.focusContent(command.content, command.inset);
        this.invalidate();
        break;
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

  private focusContent(content: MapContentReference, inset?: { right?: number; bottom?: number }) {
    const item = this.interaction?.findByContent(content) ?? null;
    if (!item) {
      // Content with no place on this map: the panel still opens, the camera stays put.
      this.interaction?.setFocused(null);
      return;
    }
    // Remember where the visitor was only for the first focus in a row.
    this.viewBeforeFocus ??= this.rig.getGoal();
    this.interaction?.setFocused(item.id);
    this.rig.focusOn(item.focus.x, item.focus.z, Math.min(this.rig.getGoal().distance, FOCUS_DISTANCE), inset);
  }

  private enter(command: Extract<WorldCommand, { type: "enter" }>) {
    if (this.bridge.store.getState().phase !== "ready") return;
    window.clearTimeout(this.leaveTimer);
    this.active = true;
    this.entering = true;
    this.bridge.set({ phase: "entering" });
    if (command.focus) this.focusContent(command.focus, command.inset);
    this.rig.playApproach(APPROACH_DISTANCE, command.reducedMotion ? 0 : APPROACH_SECONDS);
    this.lastTickAt = 0;
    this.lastFrameAt = 0;
    this.resetFramePacing();
    this.invalidate();
  }

  private exit(reducedMotion: boolean) {
    const phase = this.bridge.store.getState().phase;
    if (phase !== "world" && phase !== "entering") return;
    this.entering = false;
    this.rig.setEnabled(false);
    this.interaction?.setHovered(null);
    this.interaction?.setFocused(null);
    this.viewBeforeFocus = null;
    this.canvas.style.cursor = "";
    this.bridge.set({ phase: phase === "entering" ? "world" : phase, hovered: null });
    this.bridge.set({ phase: "leaving" });
    // The page fades the canvas out; keep the last frame until it has.
    this.leaveTimer = window.setTimeout(() => {
      this.active = false;
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = 0;
      this.bridge.set({ phase: "ready" });
      this.bridge.events.emit({ type: "exited" });
    }, reducedMotion ? 0 : LEAVE_MS);
  }

  private isInteractive() {
    return this.active && this.bridge.store.getState().phase === "world" && this.interaction !== null;
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
    if (this.disposed || !this.active || this.pickHandle !== 0) return;
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
    if (this.disposed || !this.active) return;
    const startedAt = performance.now();
    // Clamp: after an idle gap the first frame must not see a huge time step.
    const delta = this.lastTickAt > 0 ? Math.min((now - this.lastTickAt) / 1000, 0.1) : 1 / 60;
    this.lastTickAt = now;
    this.elapsedSeconds += delta;
    const cameraMoving = this.rig.update(delta);
    // Animated models need a frame every frame for as long as the world is shown.
    const animating = this.entities?.update(delta) ?? false;
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
    this.stats.worstFrameIntervalMs = Math.max(this.stats.worstFrameIntervalMs, this.stats.frameIntervalMs);
    this.stats.drawCalls = info.render.calls;
    this.stats.triangles = info.render.triangles;
    this.stats.geometries = info.memory.geometries;
    this.stats.textures = info.memory.textures;
    this.stats.programs = info.programs?.length ?? 0;
    this.lastFrameAt = cameraMoving || animating ? now : 0;

    if (cameraMoving) {
      this.invalidate();
      return;
    }
    if (animating) this.invalidate();
    // Otherwise the loop stops here; the next frame after an idle gap starts a fresh time step.
    else this.lastTickAt = 0;
    if (this.entering) {
      // The approach has landed: the visitor may take over.
      this.entering = false;
      this.rig.setEnabled(true);
      this.bridge.set({ phase: "world" });
      this.bridge.events.emit({ type: "entered" });
    }
    // The world moved under a resting pointer: what it hovers may have changed.
    if (this.pointer && !animating) this.schedulePick();
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
