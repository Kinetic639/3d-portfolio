import * as THREE from "three";
import type { QualityTier, WorldBridge } from "@/lib/bridge/world-bridge";
import { createLoadedMapState, type MapDefinition } from "@/lib/maps/map-definition";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import { CameraRig } from "./camera-rig";
import { buildEntityLayer, type EntityLayer } from "./entity-meshes";
import { Environment } from "./environment";
import { buildVoxelTerrain, type TerrainSource } from "./terrain-meshes";

/**
 * The 3D runtime. Plain TypeScript on three.js: no React anywhere in this
 * folder. The page talks to it only through the `WorldBridge`.
 *
 * Rendering is on demand. A frame is drawn when something invalidates the
 * view (camera motion, a resize, an animation), so an idle world costs no CPU
 * or GPU time at all.
 */
export type EngineStats = {
  /** Frames drawn since the engine started. */
  frames: number;
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

const PIXEL_RATIO_CAP: Record<QualityTier, number> = { low: 1, medium: 1.25, high: 1.5 };

export class WorldEngine {
  readonly stats: EngineStats = { frames: 0, frameCpuMs: 0, frameIntervalMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 };
  private readonly canvas: HTMLCanvasElement;
  private readonly bridge: WorldBridge;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly environment: Environment;
  private readonly rig: CameraRig;
  private readonly resizeObserver: ResizeObserver;
  private readonly unsubscribe: Array<() => void> = [];
  private elapsedSeconds = 0;
  private lastTickAt = 0;
  private world: VoxelWorld | null = null;
  private terrain: TerrainSource | null = null;
  private entities: EntityLayer | null = null;
  private frameHandle = 0;
  private lastFrameAt = 0;
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
    this.rig = new CameraRig(canvas, { onChange: () => this.invalidate() });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.unsubscribe.push(
      () => canvas.removeEventListener("webglcontextlost", this.onContextLost),
      bridge.commands.subscribe((command) => {
        if (command.type === "set-quality") {
          bridge.set({ quality: command.quality });
          this.resize();
        }
      }),
    );
  }

  /** Builds everything a map needs. Resolves once the scene can be rendered. */
  async loadMap(definition: MapDefinition, options: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {}) {
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
    this.scene.add(terrain.group, this.entities.group);
    this.environment.apply(map.environment);

    // The camera may only centre on the playable area; backdrop scenery stays out of reach.
    const min = world.gridToWorld(map.playableBounds.minX, 0, map.playableBounds.minZ);
    const max = world.gridToWorld(map.playableBounds.maxX, 0, map.playableBounds.maxZ);
    const margin = 6;
    this.rig.setBounds({ minX: min.x + margin, maxX: max.x - margin, minZ: min.z + margin, maxZ: max.z - margin });
    const spawn = map.spawnPoints.find((candidate) => candidate.id === map.defaultSpawnId) ?? map.spawnPoints[0];
    const focus = spawn ? world.gridToWorld(spawn.cameraTarget?.x ?? spawn.position.x, 0, spawn.cameraTarget?.z ?? spawn.position.z) : { x: (min.x + max.x) / 2, z: (min.z + max.z) / 2 };
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
    this.frameHandle = 0;
    this.resizeObserver.disconnect();
    this.unsubscribe.forEach((stop) => stop());
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
    if (this.entities) {
      this.scene.remove(this.entities.group);
      this.entities.dispose();
      this.entities = null;
    }
    this.world = null;
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

  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.bridge.set({ phase: "unavailable", error: "The graphics context was lost." });
  };
}
