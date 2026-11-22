import * as THREE from "three";
import type { QualityTier, WorldBridge, WorldCommand } from "@/lib/bridge/world-bridge";
import { decodeBakedWorld, type RuntimeMap } from "@/lib/bake/baked-format";
import type { MapContentReference, MapDefinition } from "@/lib/maps/map-definition";
import { createBakedQuery } from "./baked-terrain";
import { CameraRig, VISITOR_CAMERA } from "./camera-rig";
import { buildEntityLayer, type EntityLayer } from "./entity-meshes";
import { ENTRY_SECONDS, FOCUS_SECONDS, loaderView, POP_COMPLETE, rehearsalTimes, sampleEntry, WAVE_UNITS_PER_SECOND, WAVE_WINDOW, type EntryPlan } from "./entry-sequence";
import { Environment } from "./environment";
import { LoaderBeacon } from "./loader-beacon";
import { MinigameHost, type MinigameHostOptions } from "./minigame-host";
import { buildZoneWorld, meshVoxelZone } from "@/lib/bake/baked-decode";
import type { VoxelWorld } from "@/lib/world/voxel-world";
import type { GridCoordinate } from "@/lib/world/world-config";
import { InteractionLayer, type Interactable } from "./interactables";
import { getModelLibrary, type ModelLibrary } from "./model-library";
import type { TerrainChunkSummary } from "./terrain-chunk";
import { getTerrainAtlas, REVEAL_COMPLETE } from "./terrain-material";
import { buildBakedTerrain, buildWorldForMap, type TerrainSource } from "./terrain-meshes";
import { buildSurfaceChunkMesh } from "@/lib/terrain/surface-mesher";
import { createVoxelWorldQuery, type WorldQuery } from "./world-query";
import { FrameRecorder } from "@/lib/perf/frame-recorder";
import { ModelWindRegistry } from "./model-wind";
import { ModelStyleRegistry } from "./model-style";
import { resolveActor, type ActorMovement } from "./actor";
import type { PlacedActor } from "./entity-meshes";
import type { ActorHud, ZoneInfo } from "@/lib/bridge/world-bridge";
import { zoneSection } from "@/lib/content/places";
import type { ContentSection } from "@/lib/content/content";
import { FOCUS_DIRECTION_YAW, frameZone, measureZones, planFlight, sampleFlight, type Flight, type ZoneArea } from "./zones";
import { LABEL_FADE_FAR, LABEL_FADE_NEAR, ZoneLabels } from "./zone-labels";
import { SkyDiscs } from "./sky-discs";

/**
 * The 3D runtime. Plain TypeScript on three.js: no React anywhere in this
 * folder. The page talks to it only through the `WorldBridge`.
 *
 * Lifecycle: construct -> `loadMap` -> `warmUp` -> (enter <-> exit)*.
 *
 * Before the visitor enters, the engine draws only the *loader*: the platform
 * at the centre of the map and the crystal over it, in a small box at the
 * bottom of the canvas (LOADER_VIEWPORT). The rest of the canvas is cleared
 * to transparent, so the page shows through. Only the objects on
 * LOADER_LAYER are drawn, scissored to the box.
 *
 * Entering plays the original entry (entry-sequence.ts): the camera leaves
 * the loader, the terrain grows out of the platform in a wave and the objects
 * pop up. The wave and the pop are shader uniforms over geometry that is
 * already on the GPU, so nothing is built or swapped while it plays.
 *
 * In the world, rendering is on demand: a frame is drawn only when something
 * invalidates the view, so an idle world costs no CPU or GPU time.
 */
export type EngineStats = {
  /** Frames drawn since the engine started (warm-up and loader frames excluded). */
  frames: number;
  /** Loader frames drawn on the landing page. */
  loaderFrames: number;
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
  /** A section's name in the visitor's language, for zone names. Without it, the section's own (English) label. */
  describeSection?: (section: ContentSection) => string;
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
/**
 * A game's view: a step out along the zoom curve, so the camera looks down
 * on the zone and nothing around it stands in front of the blocks. The pitch
 * applies only with the angle lock on (off the curve).
 */
const MINIGAME_DISTANCE = 38;
const MINIGAME_PITCH = 44;
const LEAVE_MS = 450;
/** The box at the bottom centre of the canvas where the loader is drawn on the landing page, in CSS pixels. */
export const LOADER_VIEWPORT = { width: 260, height: 200 } as const;
/** Layer of everything the loader view draws: the platform's terrain chunks, the crystal and the lights. */
const LOADER_LAYER = 1;
/** Seconds the platform's idle wave takes to settle once the world is ready (original: 0.45). */
const LOADER_SETTLE_SECONDS = 0.45;
/** A warm frame (CPU + GPU, forced to finish) must fit comfortably inside a 60 Hz frame. */
const WARM_FRAME_BUDGET_MS = 10;
/** Longest single slice of warm-up work per animation frame. */
const WARM_SLICE_MS = 6;

/** 30 frames per second for wind alone. */
const WIND_FRAME_MS = 1000 / 30;

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

export class WorldEngine {
  readonly stats: EngineStats = { frames: 0, loaderFrames: 0, picks: 0, frameCpuMs: 0, frameIntervalMs: 0, worstFrameIntervalMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 };
  /** The last few seconds of world frames (not warm-up or loader frames), for the perf HUD. */
  readonly frames = new FrameRecorder();
  private readonly frustum = new THREE.Frustum();
  private readonly viewProjection = new THREE.Matrix4();
  private modelStyles: ModelStyleRegistry | null = null;
  /** The creature the visitor chose: clicks on the ground send it there. */
  private chosenActor: PlacedActor | null = null;
  /** Ground of the loaded map, for sending creatures. */
  private query: WorldQuery | null = null;
  private actorMovement: ActorHud["movement"] = "auto";
  private followingActor = false;
  private readonly actorTarget = new THREE.Vector3();
  /** Where the entry left the camera: Reset view returns there. */
  private startView: ReturnType<CameraRig["getGoal"]> | null = null;
  private readonly shadowFocus = new THREE.Vector3();
  /** Zones that are places to go, by numeric id. */
  private places = new Map<number, { info: ZoneInfo; area: ZoneArea; yaw: number | null }>();
  private zoneLabels: ZoneLabels | null = null;
  /** The environment's sky version last copied to the terrain. */
  private terrainSky = -1;
  /** The sun and the moon, low over the horizon beyond the map. */
  private readonly skyDiscs = new SkyDiscs();
  /** A flight to a zone in progress; `goal` is where it put the rig last frame, so input that moves the goal ends it. */
  private flight: { plan: Flight; elapsed: number; goal: ReturnType<CameraRig["getGoal"]> | null } | null = null;
  /** The last frame was drawn only because of the wind: draw at WIND_FRAME_MS. */
  private windOnly = false;
  private lastWindFrameAt = 0;
  warmUpReport: WarmUpReport | null = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly bridge: WorldBridge;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly environment: Environment;
  private readonly rig: CameraRig;
  private readonly rehearsalCamera = new THREE.PerspectiveCamera();
  private readonly loaderCamera = new THREE.PerspectiveCamera(32, 1, 0.5, 600);
  private readonly beacon = new LoaderBeacon();
  private entryPlan: EntryPlan | null = null;
  /** Terrain meshes that hold the loader platform. */
  private loaderMeshes: THREE.Object3D[] = [];
  /** Largest reveal delay on the map: the wave is over when it passes this. */
  private revealEnd = 0;
  /** The entry in progress, or null. */
  private entry: { elapsed: number; reducedMotion: boolean; focus?: MapContentReference; inset?: { right?: number; bottom?: number } } | null = null;
  /** The wave still growing far terrain after the camera has arrived, or null. */
  private wave: number | null = null;
  private readonly entryTarget = new THREE.Vector3();
  /** Background of the scene, kept so it can be taken away while the page fades out behind the world. */
  private sky: THREE.Scene["background"] = null;
  /** Where the camera rests at the start of a visit. */
  private spawn = { x: 0, z: 0 };
  private landing = false;
  private readonly landingLoader: boolean;
  /** Shaders are compiled (warm-up step 1): the loader may draw without compiling anything on the main thread. */
  private loaderReady = false;
  /** Warm-up is running; it draws the loader itself after each of its own renders. */
  private warming = false;
  private landingHandle = 0;
  private lastLandingAt = 0;
  /** Seconds the platform's wave has been settling, or null when not settling. */
  private loaderSettle: number | null = null;
  private readonly resizeObserver: ResizeObserver;
  private readonly cleanup: Array<() => void> = [];
  private terrain: TerrainSource | null = null;
  private entities: EntityLayer | null = null;
  private interaction: InteractionLayer | null = null;
  private minigames: MinigameHost | null = null;
  /** Where the camera was before a mini-game started. */
  private viewBeforeMinigame: ReturnType<CameraRig["getGoal"]> | null = null;
  private readonly ray = new THREE.Ray();
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
  /**
   * `landingLoader`: draw the original loader (platform and crystal) at the bottom of the landing
   * page while the visitor reads. Off on the site, where the door in the page's sidebar is the way in.
   */
  constructor(canvas: HTMLCanvasElement, bridge: WorldBridge, context: WebGL2RenderingContext, options: { landingLoader?: boolean } = {}) {
    this.canvas = canvas;
    this.landingLoader = options.landingLoader ?? true;
    this.bridge = bridge;
    this.renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true });
    this.environment = new Environment(this.scene);
    this.sky = this.scene.background;
    this.scene.add(this.skyDiscs.group);
    this.rig = new CameraRig(canvas, {
      ...VISITOR_CAMERA,
      // Input wants full-rate frames at once, even when only the wind was moving before.
      onChange: () => {
        this.windOnly = false;
        this.invalidate();
      },
      onTap: (clientX, clientY) => this.handleTap(clientX, clientY),
      onUserPan: () => this.stopFollowing(),
    });
    this.rig.setEnabled(false);
    bridge.diagnostics.engine = { frames: this.frames, stats: this.stats, view: () => this.rig.getView() };

    this.beacon.group.traverse((object) => object.layers.enable(LOADER_LAYER));
    this.scene.add(this.beacon.group);
    // Lights are filtered by layer too; the crystal needs them in the loader view.
    this.scene.traverse((object) => {
      if ((object as THREE.Light).isLight) object.layers.enable(LOADER_LAYER);
    });
    this.loaderCamera.layers.set(LOADER_LAYER);
    this.cleanup.push(bridge.store.subscribe((state, previous) => {
      if (state.phase === "ready" && previous.phase !== "ready") this.presentLoader();
    }));

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
    // Wind is motion nobody asked for: still for visitors who prefer reduced motion.
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionPreference = () => {
      this.environment.wind.setStilled(reducedMotion.matches);
      this.invalidate();
    };
    onMotionPreference();
    reducedMotion.addEventListener("change", onMotionPreference);
    this.cleanup.push(() => reducedMotion.removeEventListener("change", onMotionPreference));
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
    const query = createVoxelWorldQuery(world);
    // Mini-games dig in the voxel world itself; a changed cell remeshes its chunk and the neighbours it borders.
    this.install(definition, terrain, query, models, options, {
      world,
      query,
      remesh: (_zoneId, cells) => terrain.rebuildChunks(chunksAround(world, cells)),
      rehearse: () => {
        for (const zone of MinigameHost.playableZones(definition)) {
          const column = firstColumn(world, zone.numericId);
          if (column) buildSurfaceChunkMesh(world, Math.floor(column.x / world.config.chunkSize), Math.floor(column.z / world.config.chunkSize), { skipMappings: true, packed: true });
        }
      },
    });
  }

  /**
   * Loads a baked world file: the visible faces it lists are written out in a
   * worker, with no voxel world to build and no neighbour to test.
   */
  async loadBaked(file: ArrayBuffer, options: LoadMapOptions = {}) {
    this.unloadMap();
    const baked = decodeBakedWorld(file);
    const query = createBakedQuery(baked);
    const [terrain, models] = await Promise.all([
      buildBakedTerrain(baked, { signal: options.signal, onProgress: options.onProgress }),
      this.loadModels(baked.header.map),
      getTerrainAtlas().ready,
    ]);
    if (this.disposed || options.signal?.aborted) {
      terrain.dispose();
      return;
    }
    // Mini-game zones were baked as voxels; they are kept here so games can change them.
    const zoneWorld = MinigameHost.playableZones(baked.header.map).length > 0 ? buildZoneWorld(baked) : null;
    const zones = baked.header.voxelZones;
    this.install(baked.header.map, terrain, query, models, options, zoneWorld ? {
      world: zoneWorld,
      query,
      remesh: (zoneId) => {
        const zone = zones.find((candidate) => candidate.zoneId === zoneId);
        if (zone) terrain.setMesh(`zone-${zoneId}`, meshVoxelZone(zoneWorld, zone));
      },
      rehearse: () => {
        for (const zone of zones) meshVoxelZone(zoneWorld, zone);
      },
    } : null);
    options.onProgress?.(1);
  }

  /** The models the map's objects use, loaded before the map is shown so warm-up covers them. */
  private async loadModels(definition: RuntimeMap) {
    const models = await getModelLibrary();
    await models.ensureLoaded(models.idsFor(definition.entities));
    return models;
  }

  private install(
    definition: RuntimeMap,
    terrain: TerrainSource,
    query: WorldQuery,
    models: ModelLibrary,
    options: LoadMapOptions,
    minigameVoxels: Omit<MinigameHostOptions, "map"> | null,
  ) {
    this.terrain = terrain;
    this.query = query;
    if (minigameVoxels && MinigameHost.playableZones(definition).length > 0) {
      this.minigames = new MinigameHost({ map: definition, ...minigameVoxels });
      this.scene.add(this.minigames.group);
    }
    this.environment.apply(definition.environment);
    // Shadows are decided before warm-up, so their programs are compiled with everything else.
    this.applyShadowAvailability(false);
    const wind = new ModelWindRegistry(models, this.environment.wind, definition.modelSettings);
    this.modelStyles = new ModelStyleRegistry(models, definition.modelSettings, definition.environment.style);
    this.syncOutlineScale();
    const actors = {
      forModel: (modelId: string) => {
        const entry = models.entry(modelId);
        return entry?.actor ? resolveActor(entry.actor, definition.modelSettings?.[modelId]?.actor) : null;
      },
      groundAt: (x: number, z: number) => groundHeight(query, x, z),
    };
    this.entities = buildEntityLayer(definition.entities, models, { wind: wind.options(), style: this.modelStyles.options(), actors });
    this.interaction = new InteractionLayer({
      map: definition,
      query,
      entities: this.entities,
      describeContent: options.describeContent ?? (() => null),
    });
    this.scene.add(terrain.group, this.entities.group, this.interaction.group);
    this.installPlaces(definition, query, options.describeSection ?? ((section) => section.label));
    this.terrainSky = -1;
    this.syncTerrainSky();

    // The camera may only centre on the playable area; backdrop scenery stays out of reach.
    const min = query.cellToWorld(definition.playableBounds.minX, 0, definition.playableBounds.minZ);
    const max = query.cellToWorld(definition.playableBounds.maxX, 0, definition.playableBounds.maxZ);
    const margin = 6;
    this.rig.setBounds({ minX: min.x + margin, maxX: max.x - margin, minZ: min.z + margin, maxZ: max.z - margin });
    const spawn = definition.spawnPoints.find((candidate) => candidate.id === definition.defaultSpawnId) ?? definition.spawnPoints[0];
    const focus = spawn
      ? query.cellToWorld(spawn.cameraTarget?.x ?? spawn.position.x, 0, spawn.cameraTarget?.z ?? spawn.position.z)
      : { x: (min.x + max.x) / 2, z: (min.z + max.z) / 2 };
    this.spawn = { x: focus.x, z: focus.z };
    this.prepareEntry();
    this.resetToLoader();
  }

  /**
   * Finds the loader platform in the terrain (the vertices the mesher marked
   * with a negative reveal delay; each chunk's summary, worked out by the
   * worker, says where they are), puts those chunks on the loader layer, and
   * works out the entry path and how long the wave runs.
   */
  private prepareEntry() {
    let top = -Infinity;
    let sumX = 0;
    let sumZ = 0;
    let count = 0;
    let revealEnd = 0;
    this.loaderMeshes = [];
    for (const mesh of this.terrain?.meshes() ?? []) {
      const summary = mesh.geometry.userData.summary as TerrainChunkSummary | undefined;
      if (!summary) continue;
      revealEnd = Math.max(revealEnd, summary.revealEnd);
      if (!summary.platform) continue;
      top = Math.max(top, summary.platform.top);
      sumX += summary.platform.sumX;
      sumZ += summary.platform.sumZ;
      count += summary.platform.count;
      mesh.layers.enable(LOADER_LAYER);
      this.loaderMeshes.push(mesh);
    }
    this.revealEnd = revealEnd;
    const platformX = count > 0 ? sumX / count : 0;
    const platformZ = count > 0 ? sumZ / count : 0;
    const platformTop = count > 0 ? top : 0;
    this.beacon.place(platformX, platformTop, platformZ);

    // The path ends where the visitor's camera rests at the spawn, and comes
    // down the visitor's own zoom curve (scaled for this screen).
    this.rig.setOrientation(VISITOR_CAMERA.yawDegrees, VISITOR_CAMERA.pitchDegrees, true);
    this.rig.lookAt(this.spawn.x, this.spawn.z, this.rig.curveDistance(VISITOR_CAMERA.initialDistance), true);
    const rest = this.rig.getGoal();
    const finalTarget = new THREE.Vector3(this.spawn.x, VISITOR_CAMERA.targetHeight, this.spawn.z);
    const curve = VISITOR_CAMERA.zoomCurve;
    this.entryPlan = {
      platformX, platformZ, platformTop, finalTarget,
      finalYaw: THREE.MathUtils.degToRad(rest.yawDegrees),
      finalDistance: rest.distance,
      farDistance: this.rig.curveDistance(curve[curve.length - 1].distance),
      pitchAt: (distance) => THREE.MathUtils.degToRad(this.rig.pitchForDistance(distance) ?? rest.pitchDegrees),
    };
    loaderView(this.entryPlan, this.loaderCamera.position, this.entryTarget);
    this.loaderCamera.lookAt(this.entryTarget);
    this.loaderCamera.updateMatrixWorld();
  }

  /** The landing state: only the platform shows, objects are hidden, the camera is back at the spawn. */
  private resetToLoader() {
    this.entry = null;
    this.wave = null;
    const uniforms = this.terrain?.uniforms;
    if (uniforms) {
      uniforms.uExpansionProgress.value = 0;
      // The platform ripples while the world is still being prepared.
      uniforms.uLoaderMotion.value = this.bridge.store.getState().phase === "ready" ? 0 : 1;
    }
    this.entities?.setPopTime(-1);
    if (this.interaction) this.interaction.group.visible = false;
    this.rig.setOrientation(VISITOR_CAMERA.yawDegrees, VISITOR_CAMERA.pitchDegrees, true);
    this.rig.lookAt(this.spawn.x, this.spawn.z, this.rig.curveDistance(VISITOR_CAMERA.initialDistance), true);
    if (this.loaderReady) this.startLanding();
  }

  /** The world is ready to enter: the platform settles, then the crystal appears. */
  private presentLoader() {
    const motion = this.terrain?.uniforms?.uLoaderMotion;
    if (motion && motion.value > 0) {
      this.loaderSettle = 0;
    } else {
      this.beacon.show();
    }
  }

  private startLanding() {
    if (this.disposed || !this.landingLoader) return;
    this.landing = true;
    this.lastLandingAt = 0;
    if (this.landingHandle === 0) this.landingHandle = requestAnimationFrame(this.landingFrame);
  }

  private stopLanding() {
    this.landing = false;
    cancelAnimationFrame(this.landingHandle);
    this.landingHandle = 0;
  }

  /** One loader frame. Runs every animation frame while the landing page shows the loader. */
  private readonly landingFrame = (now: number) => {
    this.landingHandle = 0;
    if (this.disposed || !this.landing) return;
    const delta = this.lastLandingAt > 0 ? Math.min((now - this.lastLandingAt) / 1000, 0.1) : 1 / 60;
    this.lastLandingAt = now;
    this.elapsedSeconds += delta;
    const uniforms = this.terrain?.uniforms;
    if (uniforms) uniforms.uTime.value = this.elapsedSeconds;
    if (this.loaderSettle !== null && uniforms) {
      this.loaderSettle += delta;
      const t = Math.min(1, this.loaderSettle / LOADER_SETTLE_SECONDS);
      // power2.out from 1 to 0.
      uniforms.uLoaderMotion.value = (1 - t) * (1 - t);
      if (t >= 1) {
        this.loaderSettle = null;
        this.beacon.show();
      }
    }
    this.beacon.update(delta, this.elapsedSeconds);
    this.environment.update(this.elapsedSeconds);
    if (!this.warming) {
      this.drawLoader();
      this.stats.loaderFrames += 1;
    }
    this.landingHandle = requestAnimationFrame(this.landingFrame);
  };

  /**
   * Clears the canvas to transparent and draws the loader into its box.
   * Leaves the renderer's scissor and every object's visibility as it found
   * them, so warm-up can call it after each of its own renders and the
   * visitor never sees those.
   */
  private drawLoader() {
    const width = this.canvas.clientWidth;
    if (width === 0) return;
    const renderer = this.renderer;
    if (!this.landingLoader) {
      // No loader on the page: the canvas stays transparent, and warm-up's own renders never show.
      if (!this.active) {
        const scissorWas = renderer.getScissorTest();
        renderer.setScissorTest(false);
        renderer.setClearAlpha(0);
        renderer.clear();
        renderer.setScissorTest(scissorWas);
      }
      return;
    }
    if (!this.landing) return;
    this.syncTerrainSky();
    const scissorWas = renderer.getScissorTest();
    const scissor = renderer.getScissor(new THREE.Vector4());
    const hidden = this.loaderMeshes.filter((mesh) => !mesh.visible);
    hidden.forEach((mesh) => { mesh.visible = true; });
    const uniforms = this.terrain?.uniforms;
    const wave = uniforms?.uExpansionProgress.value ?? 0;
    if (uniforms) uniforms.uExpansionProgress.value = 0;
    // Warm-up forces the crystal on to compile it; the visitor sees it only once it has been shown.
    const beaconVisible = this.beacon.group.visible;
    this.beacon.group.visible = this.beacon.shown;

    // No sky around the loader: the page shows through.
    const background = this.scene.background;
    this.scene.background = null;
    renderer.setClearAlpha(0);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    renderer.setScissor((width - LOADER_VIEWPORT.width) / 2, 0, LOADER_VIEWPORT.width, LOADER_VIEWPORT.height);
    renderer.render(this.scene, this.loaderCamera);
    this.scene.background = background;

    if (uniforms) uniforms.uExpansionProgress.value = wave;
    this.beacon.group.visible = beaconVisible;
    hidden.forEach((mesh) => { mesh.visible = false; });
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorWas);
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

    // Everything the entry will show must be compiled and uploaded now, including what the landing hides.
    const interactionGroup = this.interaction?.group;
    if (interactionGroup) interactionGroup.visible = true;
    this.beacon.forceVisible();
    this.minigames?.showForWarmUp(true);
    this.zoneLabels?.showForWarmUp(true);
    const restore = () => {
      if (interactionGroup) interactionGroup.visible = false;
      this.minigames?.showForWarmUp(false);
      this.zoneLabels?.showForWarmUp(false);
      if (this.bridge.store.getState().phase === "ready") this.beacon.show();
      else this.beacon.hide();
      if (this.terrain?.uniforms) this.terrain.uniforms.uExpansionProgress.value = 0;
      this.entities?.setPopTime(-1);
      this.drawLoader();
    };
    this.warming = true;
    try {
      return await this.warmUpSteps(options, startedAt, aborted, renderSync, camera);
    } finally {
      this.warming = false;
      restore();
    }
  }

  private async warmUpSteps(
    options: { signal?: AbortSignal; onProgress?: (fraction: number) => void },
    startedAt: number,
    aborted: () => boolean,
    renderSync: (view: THREE.Camera) => number,
    camera: THREE.PerspectiveCamera,
  ): Promise<WarmUpReport | null> {
    await this.renderer.compileAsync(this.scene, camera);
    if (aborted()) return null;
    options.onProgress?.(0.2);
    // A mini-game's first dig would otherwise be the first run of the mesher on this thread.
    if (this.minigames) {
      for (let pass = 0; pass < 4; pass += 1) {
        await nextFrame();
        if (aborted()) return null;
        this.minigames.rehearseDig();
      }
    }
    // Every program exists now: the loader can start showing without a compile on the main thread.
    this.loaderReady = true;
    this.startLanding();
    this.drawLoader();

    // Step 2: uploads.
    const objects: THREE.Object3D[] = [
      ...(this.terrain?.meshes() ?? []),
      ...(this.entities?.group.children ?? []),
      ...(this.interaction?.group.children ?? []),
      ...(this.minigames?.group.children ?? []),
      ...(this.zoneLabels?.group.children ?? []),
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
        // Keep the visible loader box showing the loader, not the upload pass.
        this.drawLoader();
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

    // Step 3: rehearsal of the entry, wave and pop included, then the resting view.
    const plan = this.entryPlan;
    const uniforms = this.terrain?.uniforms;
    const resourceCount = () => (this.renderer.info.programs?.length ?? 0) + this.renderer.info.memory.geometries + this.renderer.info.memory.textures;
    const rehearse = async () => {
      const times: number[] = [];
      const moments = plan ? rehearsalTimes(12) : [];
      for (const moment of [...moments, -1, -1]) {
        await nextFrame();
        if (aborted()) return null;
        this.rehearsalCamera.copy(camera);
        if (plan && moment >= 0) {
          const sample = sampleEntry(plan, moment, this.rehearsalCamera.position, this.entryTarget);
          this.rehearsalCamera.lookAt(this.entryTarget);
          if (uniforms) uniforms.uExpansionProgress.value = sample.wave;
          this.entities?.setPopTime(sample.popSeconds);
        } else {
          if (uniforms) uniforms.uExpansionProgress.value = REVEAL_COMPLETE;
          this.entities?.setPopTime(POP_COMPLETE);
        }
        this.rehearsalCamera.updateMatrixWorld();
        times.push(renderSync(this.rehearsalCamera));
        this.drawLoader();
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
    if (this.bridge.diagnostics.engine?.frames === this.frames) this.bridge.diagnostics.engine = null;
    cancelAnimationFrame(this.frameHandle);
    cancelAnimationFrame(this.pickHandle);
    window.clearTimeout(this.leaveTimer);
    this.frameHandle = this.pickHandle = 0;
    this.resizeObserver.disconnect();
    this.cleanup.forEach((stop) => stop());
    this.stopLanding();
    this.beacon.dispose();
    this.rig.dispose();
    this.unloadMap();
    this.renderer.dispose();
  }

  private unloadMap() {
    this.stopLanding();
    this.loaderReady = false;
    this.loaderMeshes = [];
    this.entryPlan = null;
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
    if (this.minigames) {
      this.scene.remove(this.minigames.group);
      this.minigames.dispose();
      this.minigames = null;
    }
    this.viewBeforeMinigame = null;
    this.bridge.set({ minigame: null });
    if (this.zoneLabels) {
      this.scene.remove(this.zoneLabels.group);
      this.zoneLabels.dispose();
      this.zoneLabels = null;
    }
    this.places.clear();
    this.flight = null;
    this.bridge.set({ zones: [], place: null });
    if (this.entities) {
      this.scene.remove(this.entities.group);
      this.entities.dispose();
      this.entities = null;
    }
    this.modelStyles?.dispose();
    this.modelStyles = null;
    this.chosenActor = null;
    this.followingActor = false;
    this.query = null;
    this.bridge.set({ actor: null });
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
        this.applyShadowAvailability(true);
        this.resize();
        break;
      case "focus-content":
        this.focusContent(command.content, command.inset);
        this.invalidate();
        break;
      case "leave-minigame":
        this.leaveMinigame();
        break;
      case "release-actor":
        this.chooseActor(null);
        break;
      case "set-angle-lock":
        this.setAngleLock(command.locked);
        break;
      case "reset-view":
        this.resetView();
        break;
      case "set-night": {
        // Only the world shown animates; on the landing page the loader changes at once.
        const immediate = command.immediate === true || !this.isInteractive();
        this.environment.setNight(command.night, immediate);
        this.syncTerrainSky();
        if (immediate) {
          this.drawLoader();
          if (this.active) this.invalidate();
        } else this.invalidate();
        break;
      }
      case "fly-to-zone":
        this.flyToZone(command.zoneId, command.inset, command.reducedMotion === true);
        break;
      case "follow-actor":
        this.followingActor = this.chosenActor !== null;
        this.publishActor();
        this.invalidate();
        break;
      case "set-actor-movement":
        this.actorMovement = command.movement;
        this.publishActor();
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
    this.flight = null;
    const item = this.interaction?.findByContent(content) ?? null;
    if (!item) {
      // Content with no place on this map: the panel still opens, the camera stays put.
      this.interaction?.setFocused(null);
      return;
    }
    // Remember where the visitor was only for the first focus in a row.
    this.viewBeforeFocus ??= this.rig.getGoal();
    this.interaction?.setFocused(item.id);
    this.rig.focusOn(item.focus.x, item.focus.z, Math.min(this.rig.getGoal().distance, this.rig.curveDistance(FOCUS_DISTANCE)), inset);
  }

  private enter(command: Extract<WorldCommand, { type: "enter" }>) {
    if (this.bridge.store.getState().phase !== "ready") return;
    window.clearTimeout(this.leaveTimer);
    this.stopLanding();
    this.loaderSettle = null;
    if (this.terrain?.uniforms) this.terrain.uniforms.uLoaderMotion.value = 0;
    this.beacon.hide();
    this.active = true;
    this.entering = true;
    this.bridge.set({ phase: "entering" });
    this.entry = { elapsed: 0, reducedMotion: command.reducedMotion === true, focus: command.focus, inset: command.inset };
    this.lastTickAt = 0;
    this.lastFrameAt = 0;
    this.resetFramePacing();
    this.invalidate();
  }

  private exit(reducedMotion: boolean) {
    const phase = this.bridge.store.getState().phase;
    if (phase !== "world" && phase !== "entering") return;
    this.entering = false;
    this.entry = null;
    this.wave = null;
    this.flight = null;
    if (this.minigames?.playing) this.leaveMinigame(false);
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
      this.resetToLoader();
      this.bridge.set({ phase: "ready" });
      this.bridge.events.emit({ type: "exited" });
    }, reducedMotion ? 0 : LEAVE_MS);
  }

  private isInteractive() {
    return this.active && this.bridge.store.getState().phase === "world" && this.interaction !== null;
  }

  /** The interactable under a point, or the zone whose name is there: icons and objects win over names, names over the ground. */
  private pickAt(clientX: number, clientY: number): { item: Interactable | null; label: string | null } {
    let label: string | null = null;
    if (!this.interaction) return { item: null, label };
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { item: null, label };
    this.stats.picks += 1;
    const item = this.interaction.pick(
      this.rig.camera,
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
      () => (label = this.labelAt(clientX, clientY)) !== null,
    );
    return { item, label };
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
    if (this.minigames?.playing) {
      // In a game the pointer aims at blocks, not at content.
      const changed = canHover ? this.minigames.hover(this.rayAt(this.pointer!.x, this.pointer!.y)) : this.minigames.hover(new THREE.Ray(new THREE.Vector3(0, -1e6, 0)));
      this.canvas.style.cursor = "crosshair";
      if (changed) this.invalidate();
      return;
    }
    const { item, label: zoneId } = canHover ? this.pickAt(this.pointer!.x, this.pointer!.y) : { item: null, label: null };
    if (zoneId) {
      const changed = this.interaction.setHovered(null);
      const id = `zone-label:${zoneId}`;
      if (this.bridge.store.getState().hovered?.id !== id) {
        const place = [...this.places.values()].find((candidate) => candidate.info.id === zoneId);
        this.canvas.style.cursor = "pointer";
        this.bridge.set({ hovered: { id, label: place?.info.label ?? zoneId, content: null, action: "open" } });
        this.invalidate();
      } else if (changed) this.invalidate();
      return;
    }
    const leftLabel = this.bridge.store.getState().hovered?.id.startsWith("zone-label:") === true;
    if (!this.interaction.setHovered(item?.id ?? null) && !leftLabel) return;
    this.canvas.style.cursor = item ? "pointer" : "";
    this.bridge.set({ hovered: item ? { id: item.id, label: item.label, content: item.content, action: item.minigame ? "play" : "open" } : null });
    this.invalidate();
  }

  private handleTap(clientX: number, clientY: number) {
    if (!this.isInteractive()) return;
    if (this.minigames?.playing) {
      const hud = this.minigames.tap(this.rayAt(clientX, clientY));
      if (hud) this.bridge.set({ minigame: hud });
      this.invalidate();
      return;
    }
    const ray = this.rayAt(clientX, clientY);
    const actor = this.actorOnRay(ray);
    if (this.chosenActor) {
      // The chosen creature: clicking it again lets it go; clicking the ground sends it there.
      if (actor === this.chosenActor) this.chooseActor(null);
      else if (actor) this.chooseActor(actor);
      else this.sendActor(ray);
      return;
    }
    if (actor) {
      this.chooseActor(actor);
      return;
    }
    const { item, label: zoneId } = this.pickAt(clientX, clientY);
    if (zoneId) {
      this.bridge.events.emit({ type: "zone-activated", zoneId });
    } else if (item?.minigame && item.zoneNumericId !== null) {
      this.startMinigame(item);
    } else if (item?.content) {
      this.bridge.events.emit({ type: "content-activated", content: item.content, interactableId: item.id });
    }
  }

  /** A ray from the camera through a point of the canvas. */
  private rayAt(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const camera = this.rig.camera;
    camera.updateMatrixWorld();
    this.ray.origin.setFromMatrixPosition(camera.matrixWorld);
    this.ray.direction.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1, 0.5).unproject(camera).sub(this.ray.origin).normalize();
    return this.ray;
  }

  /** Starts a zone's game: the camera comes closer, the HUD appears, clicks act on blocks. */
  private startMinigame(item: Interactable) {
    const hud = this.minigames?.start(item.zoneNumericId!);
    if (!hud) return;
    this.flight = null;
    this.viewBeforeMinigame = this.rig.getGoal();
    this.interaction?.setHovered(null);
    this.interaction?.setFocused(item.id);
    // On the curve the distance sets the tilt; with the angle locked the tilt stays.
    this.rig.setOrientation(undefined, MINIGAME_PITCH);
    this.rig.focusOn(item.focus.x, item.focus.z, this.rig.curveDistance(MINIGAME_DISTANCE));
    this.bridge.set({ minigame: hud, hovered: null });
    this.schedulePick();
    this.invalidate();
  }

  /** Back to exploring; the holes stay for this visit. */
  private leaveMinigame(restoreView = true) {
    if (!this.minigames?.playing) return;
    this.minigames.stop();
    this.interaction?.setFocused(null);
    if (restoreView && this.viewBeforeMinigame) {
      const { x, z, distance, yawDegrees, pitchDegrees } = this.viewBeforeMinigame;
      this.rig.setOrientation(yawDegrees, pitchDegrees);
      this.rig.lookAt(x, z, distance);
    }
    this.viewBeforeMinigame = null;
    this.canvas.style.cursor = "";
    this.bridge.set({ minigame: null });
    this.schedulePick();
    this.invalidate();
  }

  private readonly frame = (now: number) => {
    this.frameHandle = 0;
    if (this.disposed || !this.active) return;
    // When only the wind moves, half the display rate is enough and saves battery.
    if (this.windOnly && this.lastWindFrameAt > 0 && now - this.lastWindFrameAt < WIND_FRAME_MS - 4) {
      this.invalidate();
      return;
    }
    this.lastWindFrameAt = now;
    const startedAt = performance.now();
    // Clamp: after an idle gap the first frame must not see a huge time step.
    const delta = this.lastTickAt > 0 ? Math.min((now - this.lastTickAt) / 1000, 0.1) : 1 / 60;
    this.lastTickAt = now;
    this.elapsedSeconds += delta;
    const cameraMoving = this.entry ? this.advanceEntry(delta) : this.flight ? this.advanceFlight(delta) : this.rig.update(delta);
    this.updatePlaces();
    const waving = this.advanceWave(delta);
    // Animated models need a frame every frame for as long as the world is shown.
    const bursting = this.minigames?.update(delta) ?? false;
    // Wind needs frames only while it blows and something it moves is in view.
    this.updateFrustum();
    const windy = this.environment.wind.active && (this.entities?.windInView(this.frustum) ?? false);
    const skyChanging = this.environment.changingSky;
    const othersAnimating = (this.entities?.update(delta, this.frustum) ?? false) || waving || bursting || skyChanging;
    const animating = othersAnimating || windy;
    this.windOnly = windy && !othersAnimating && !cameraMoving && this.entry === null;
    if (this.chosenActor) {
      const status = this.chosenActor.actor.status;
      if (this.followingActor) {
        const at = this.chosenActor.actor.position;
        if (this.actorTarget.distanceToSquared(at) > 1e-6) {
          this.actorTarget.copy(at);
          this.rig.lookAt(at.x, at.z);
        }
      }
      if (status.state !== this.bridge.store.getState().actor?.state) this.publishActor();
    }
    this.environment.update(this.elapsedSeconds, delta);
    this.syncTerrainSky();
    if (this.renderer.shadowMap.enabled) {
      const view = this.rig.getView();
      this.environment.followView(this.shadowFocus.set(view.x, 0, view.z), view.distance);
    }
    if (this.terrain?.uniforms) this.terrain.uniforms.uTime.value = this.elapsedSeconds;
    // While the camera leaves the loader, the page is still fading out underneath: no sky yet,
    // so the canvas covers the whole viewport at once without a visible edge.
    const transparent = this.entry !== null && this.entry.elapsed < FOCUS_SECONDS;
    this.scene.background = transparent ? null : this.sky;
    this.renderer.setClearAlpha(transparent ? 0 : 1);
    if (this.interaction) {
      this.rig.camera.updateMatrixWorld();
      this.interaction.updateOccluders(this.rig.camera);
    }
    this.skyDiscs.update(this.rig.camera, this.environment.skyState);
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
    this.frames.record(now, this.stats.frameIntervalMs, this.stats.frameCpuMs);
    this.lastFrameAt = cameraMoving || animating ? now : 0;

    if (this.entering && !this.entry) {
      // The camera has arrived: the visitor may take over.
      this.entering = false;
      this.rig.setEnabled(true);
      this.bridge.set({ phase: "world" });
      this.bridge.events.emit({ type: "entered" });
    }
    if (cameraMoving) {
      this.invalidate();
      return;
    }
    if (animating) this.invalidate();
    // Otherwise the loop stops here; the next frame after an idle gap starts a fresh time step.
    else this.lastTickAt = 0;
    // The world moved under a resting pointer: what it hovers may have changed.
    if (this.pointer && !animating) this.schedulePick();
  };

  /** Moves the entry along. Returns true while the camera is still travelling. */
  private advanceEntry(delta: number) {
    const entry = this.entry!;
    const plan = this.entryPlan;
    entry.elapsed = entry.reducedMotion || !plan ? ENTRY_SECONDS : entry.elapsed + delta;
    const camera = this.rig.camera;
    const sample = plan
      ? sampleEntry(plan, entry.elapsed, camera.position, this.entryTarget)
      : { wave: REVEAL_COMPLETE, popSeconds: POP_COMPLETE, done: true };
    if (plan) camera.lookAt(this.entryTarget);
    if (this.terrain?.uniforms) this.terrain.uniforms.uExpansionProgress.value = sample.wave;
    this.entities?.setPopTime(sample.popSeconds);
    if (!sample.done) return true;

    this.entry = null;
    // The camera is exactly where the rig rests; hand it back.
    const goal = this.rig.getGoal();
    this.startView = { ...goal };
    this.rig.lookAt(goal.x, goal.z, goal.distance, true);
    this.entities?.setPopTime(POP_COMPLETE);
    if (this.interaction) this.interaction.group.visible = true;
    // Far terrain may still be growing; with reduced motion it is all there at once.
    this.wave = entry.reducedMotion ? null : sample.wave;
    if (entry.reducedMotion && this.terrain?.uniforms) this.terrain.uniforms.uExpansionProgress.value = REVEAL_COMPLETE;
    if (entry.focus) this.focusContent(entry.focus, entry.inset);
    return entry.focus !== undefined;
  }

  /** Grows the rest of the terrain after the camera has arrived. Returns true while it is growing. */
  private advanceWave(delta: number) {
    if (this.wave === null) return false;
    const uniforms = this.terrain?.uniforms;
    this.wave += delta * WAVE_UNITS_PER_SECOND;
    if (!uniforms || this.wave >= this.revealEnd + WAVE_WINDOW) {
      this.wave = null;
      if (uniforms) uniforms.uExpansionProgress.value = REVEAL_COMPLETE;
      return false;
    }
    uniforms.uExpansionProgress.value = this.wave;
    return true;
  }

  /** The original's angle lock: keeps the current tilt (off the zoom curve); turning and zooming stay free. */
  private setAngleLock(locked: boolean) {
    const pitch = this.rig.getGoal().pitchDegrees;
    this.rig.setCurveEnabled(!locked);
    this.rig.configure(locked
      ? { minPitchDegrees: pitch, maxPitchDegrees: pitch }
      : { minPitchDegrees: VISITOR_CAMERA.minPitchDegrees, maxPitchDegrees: VISITOR_CAMERA.maxPitchDegrees });
    this.bridge.set({ angleLocked: locked });
  }

  /** Back to the view the entry ended on (the angle lock is lifted, nothing is followed). */
  private resetView() {
    const view = this.startView;
    if (!view) return;
    this.flight = null;
    if (this.bridge.store.getState().angleLocked) this.setAngleLock(false);
    this.followingActor = false;
    if (this.chosenActor) this.publishActor();
    this.rig.setOrientation(view.yawDegrees, view.pitchDegrees);
    this.rig.lookAt(view.x, view.z, view.distance);
    this.invalidate();
  }

  /** Day or night on the terrain: its shader keeps its own light, recoloured by the environment's sky. */
  private syncTerrainSky() {
    const uniforms = this.terrain?.uniforms;
    if (!uniforms || this.terrainSky === this.environment.skyVersion) return;
    this.terrainSky = this.environment.skyVersion;
    uniforms.uLightTint.value.copy(this.environment.skyState.terrainTint);
    uniforms.uLightGlow.value.copy(this.environment.skyState.terrainGlow);
    this.entities?.setUnlitTint(this.environment.skyState.terrainTint);
  }

  /** Zones that are places (a section of the site, or a mini-game): their areas, names on the terrain, and the list the UI shows. */
  private installPlaces(definition: RuntimeMap, query: WorldQuery, describeSection: (section: ContentSection) => string) {
    const areas = measureZones(query);
    const listed: ZoneInfo[] = [];
    for (const zone of [...definition.zones].sort((a, b) => a.displayOrder - b.displayOrder)) {
      const area = areas.get(zone.numericId);
      if (!area) continue;
      const section = zoneSection(zone);
      const minigame = zone.kind === "minigame";
      if (!section && !minigame) continue;
      const info: ZoneInfo = { id: zone.id, label: section ? describeSection(section) : zone.label, color: zone.color, kind: section?.kind ?? null, minigame };
      listed.push(info);
      this.places.set(zone.numericId, { info, area, yaw: zone.focusDirection ? FOCUS_DIRECTION_YAW[zone.focusDirection] ?? null : null });
    }
    this.zoneLabels = new ZoneLabels([...this.places.values()].map(({ info, area }) => ({
      zoneId: info.id, text: info.label, color: info.color, x: area.labelX, y: area.labelY, z: area.labelZ,
    })));
    this.zoneLabels.resize(Math.max(1, this.canvas.clientHeight), this.rig.camera.fov);
    this.scene.add(this.zoneLabels.group);
    this.bridge.set({ zones: listed, place: null });
  }

  /** Zone names fade with the zoom; the zone under the camera's target is published when it changes. */
  private updatePlaces() {
    const view = this.rig.getView();
    const hidden = this.entry !== null || this.minigames?.playing === true || !this.isInteractive();
    this.zoneLabels?.update(view.distance, this.rig.curveDistance(LABEL_FADE_NEAR), this.rig.curveDistance(LABEL_FADE_FAR), hidden);
    if (!this.query || this.entry) return;
    const column = Math.floor(view.x + this.query.width / 2);
    const row = Math.floor(view.z + this.query.depth / 2);
    const place = this.places.get(this.query.columnZone(column, row))?.info.id ?? null;
    if (place !== this.bridge.store.getState().place) this.bridge.set({ place });
  }

  /** The zone whose name is under a point of the canvas, or null. */
  private labelAt(clientX: number, clientY: number) {
    if (!this.zoneLabels?.visible) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    this.rig.camera.updateMatrixWorld();
    return this.zoneLabels.pick(this.rig.camera, ((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1, rect.width / rect.height);
  }

  /**
   * Flies to a zone and frames all of it: from the zone's own focus direction
   * when the map gives one, on the zoom curve, rising over the way when the
   * trip is long. Input during the flight takes over at once.
   */
  private flyToZone(zoneId: string, inset: { right?: number; bottom?: number } | undefined, reducedMotion: boolean) {
    const place = [...this.places.values()].find((candidate) => candidate.info.id === zoneId);
    if (!place || !this.isInteractive()) return;
    if (this.minigames?.playing) this.leaveMinigame(false);
    this.interaction?.setFocused(null);
    this.viewBeforeFocus = null;
    if (this.followingActor) {
      this.followingActor = false;
      this.publishActor();
    }
    const goal = this.rig.getGoal();
    const camera = this.rig.camera;
    const yaw = place.yaw ?? THREE.MathUtils.degToRad(goal.yawDegrees);
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const right = Math.min(inset?.right ?? 0, width * 0.6);
    const bottom = Math.min(inset?.bottom ?? 0, height * 0.6);
    const curve = VISITOR_CAMERA.zoomCurve;
    const pitchAt = (distance: number) => THREE.MathUtils.degToRad(this.rig.pitchForDistance(distance) ?? goal.pitchDegrees);
    // Frame the zone in the part of the screen a panel leaves free.
    const frame = frameZone(place.area, {
      yawRadians: yaw,
      fovDegrees: camera.fov * (1 - bottom / height),
      aspect: (width - right) / Math.max(1, height - bottom),
      pitchAt,
      minDistance: this.rig.curveDistance(curve[0].distance),
      maxDistance: this.rig.curveDistance(curve[curve.length - 1].distance),
    });
    // Shift the target so the zone sits in the middle of the free part:
    // right (screen) is (cos yaw, -sin yaw) on the ground, up-screen is away from the camera.
    const halfHeight = frame.distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const across = (right / width) * halfHeight * (width / height);
    const along = ((bottom / height) * halfHeight) / Math.max(0.2, Math.sin(pitchAt(frame.distance)));
    const to = {
      x: frame.x + Math.cos(yaw) * across + Math.sin(yaw) * along,
      z: frame.z - Math.sin(yaw) * across + Math.cos(yaw) * along,
      distance: frame.distance,
      yaw,
    };
    if (reducedMotion) {
      this.flight = null;
      this.rig.setOrientation(THREE.MathUtils.radToDeg(yaw), undefined, true);
      this.rig.lookAt(to.x, to.z, to.distance, true);
    } else {
      const from = { x: goal.x, z: goal.z, distance: goal.distance, yaw: THREE.MathUtils.degToRad(goal.yawDegrees) };
      this.flight = { plan: planFlight(from, to), elapsed: 0, goal: null };
    }
    this.invalidate();
  }

  /** One step of a zone flight. Returns true while the camera is still travelling. */
  private advanceFlight(delta: number) {
    const flight = this.flight!;
    const goal = this.rig.getGoal();
    const moved = flight.goal !== null && (
      Math.abs(goal.x - flight.goal.x) > 1e-4 || Math.abs(goal.z - flight.goal.z) > 1e-4
      || Math.abs(goal.distance - flight.goal.distance) > 1e-4 || Math.abs(goal.yawDegrees - flight.goal.yawDegrees) > 1e-3
    );
    if (moved) {
      // The visitor took over.
      this.flight = null;
      return this.rig.update(delta);
    }
    flight.elapsed += delta;
    const pose = sampleFlight(flight.plan, flight.elapsed);
    this.rig.setOrientation(THREE.MathUtils.radToDeg(pose.yaw), undefined, true);
    this.rig.lookAt(pose.x, pose.z, pose.distance, true);
    flight.goal = this.rig.getGoal();
    if (!pose.done) return true;
    this.flight = null;
    return false;
  }

  private updateFrustum() {
    const camera = this.rig.camera;
    camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
  }

  /** For tests and the perf probe. */
  windInView() {
    if (!this.entities) return false;
    this.updateFrustum();
    return this.entities.windInView(this.frustum);
  }

  /** The nearest creature whose bounds the ray passes through. */
  private actorOnRay(ray: THREE.Ray) {
    let best: PlacedActor | null = null;
    let bestDistance = Infinity;
    for (const placed of this.entities?.actors ?? []) {
      const hit = ray.intersectSphere(placed.bounds(), this.actorTarget);
      if (!hit) continue;
      const distance = hit.distanceTo(ray.origin);
      if (distance < bestDistance) {
        best = placed;
        bestDistance = distance;
      }
    }
    if (best) this.actorTarget.copy(best.actor.position);
    return best;
  }

  /** Chooses a creature (the camera follows it) or lets it go (null). */
  private chooseActor(placed: PlacedActor | null) {
    this.chosenActor = placed;
    this.followingActor = placed !== null;
    if (placed) this.actorTarget.set(Number.NaN, 0, 0);
    this.interaction?.setHovered(null);
    this.publishActor();
    this.invalidate();
  }

  /** Sends the chosen creature to where the ray meets the ground. */
  private sendActor(ray: THREE.Ray) {
    const placed = this.chosenActor;
    const hit = this.query?.raycast(ray.origin, ray.direction);
    if (!placed || !hit) return;
    const point = ray.at(hit.distance, new THREE.Vector3());
    const destination = new THREE.Vector3(point.x, groundHeight(this.query!, point.x, point.z), point.z);
    placed.actor.goTo(destination, this.movementTo(placed, destination));
    this.followingActor = true;
    this.publishActor();
    this.invalidate();
  }

  /** "auto": walk close by, run further, fly far or up and down a step. */
  private movementTo(placed: PlacedActor, destination: THREE.Vector3): ActorMovement {
    if (this.actorMovement !== "auto") return this.actorMovement;
    const from = placed.actor.position;
    const distance = Math.hypot(destination.x - from.x, destination.z - from.z);
    if (distance > 10 || Math.abs(destination.y - from.y) > 1.5) return "flight";
    return distance > 4 ? "run" : "walk";
  }

  private stopFollowing() {
    if (!this.followingActor) return;
    this.followingActor = false;
    this.publishActor();
  }

  private publishActor() {
    const placed = this.chosenActor;
    this.bridge.set({
      actor: placed ? { entityId: placed.entityId, name: placed.name, state: placed.actor.status.state, movement: this.actorMovement, following: this.followingActor } : null,
    });
  }

  private resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    const quality = this.bridge.store.getState().quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP[quality]));
    this.renderer.setSize(width, height, false);
    this.rig.setAspect(width / height);
    // A turned phone moves the zoom curve; an entry not yet started follows it.
    if (this.entryPlan && !this.entry) {
      const curve = VISITOR_CAMERA.zoomCurve;
      this.entryPlan.finalDistance = this.rig.getGoal().distance;
      this.entryPlan.farDistance = this.rig.curveDistance(curve[curve.length - 1].distance);
    }
    this.loaderCamera.aspect = width / height;
    this.loaderCamera.updateProjectionMatrix();
    this.zoneLabels?.resize(height, this.rig.camera.fov);
    this.syncOutlineScale();
    this.invalidate();
  }

  /** Screen-space outlines need the size of a pixel at distance 1. */
  private syncOutlineScale() {
    this.modelStyles?.surface.setViewport(this.rig.camera.fov, this.canvas.clientHeight || 1);
  }

  /**
   * Shadow maps on when the map has shadows and the quality tier is not low.
   * Turning them on or off changes every lit program, so a change after
   * warm-up (a quality switch) recompiles them: `recompile`.
   */
  private applyShadowAvailability(recompile: boolean) {
    const enabled = this.environment.shadowsEnabled && this.bridge.store.getState().quality !== "low";
    if (this.renderer.shadowMap.enabled === enabled) return;
    this.renderer.shadowMap.enabled = enabled;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.environment.sun.castShadow = enabled;
    if (recompile) {
      this.scene.traverse((object) => {
        const material = (object as THREE.Mesh).material;
        for (const item of Array.isArray(material) ? material : material ? [material] : []) item.needsUpdate = true;
      });
    }
  }
}

/** Chunks that show a set of cells: each cell's own, and the neighbour across any chunk edge it touches. */
function chunksAround(world: VoxelWorld, cells: GridCoordinate[]) {
  const ids = new Set<string>();
  const { chunkSize, width, depth } = world.config;
  for (const cell of cells) {
    for (const [dx, dz] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const x = cell.x + dx;
      const z = cell.z + dz;
      if (x < 0 || z < 0 || x >= width || z >= depth) continue;
      ids.add(world.getChunkId(Math.floor(x / chunkSize), Math.floor(z / chunkSize)));
    }
  }
  return ids;
}

/** Any column of a zone, or null. */
function firstColumn(world: VoxelWorld, zoneId: number) {
  const { width } = world.config;
  const index = world.zones.indexOf(zoneId);
  return index < 0 ? null : { x: index % width, z: Math.floor(index / width) };
}

/** Ground height at a world position (the query works in grid columns). */
function groundHeight(query: WorldQuery, x: number, z: number) {
  const column = Math.min(query.width - 1, Math.max(0, Math.floor(x + query.width / 2)));
  const row = Math.min(query.depth - 1, Math.max(0, Math.floor(z + query.depth / 2)));
  return query.surfaceHeight(column, row);
}
