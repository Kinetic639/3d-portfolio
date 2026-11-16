import * as THREE from "three";
import { decodeBakedWorld } from "@/lib/bake/baked-format";
import { createBakedTerrain } from "@/lib/engine/baked-terrain";
import { CameraRig, VISITOR_CAMERA } from "@/lib/engine/camera-rig";
import { buildEntityLayer, type EntityLayer } from "@/lib/engine/entity-meshes";
import { POP_COMPLETE } from "@/lib/engine/entry-sequence";
import { Environment } from "@/lib/engine/environment";
import { ModelWindRegistry } from "@/lib/engine/model-wind";
import { ModelStyleRegistry } from "@/lib/engine/model-style";
import { createWindDebugMaterial, type WindDebugView } from "./wind-debug";
import type { ModelLibrary } from "@/lib/engine/model-library";
import type { TerrainSource } from "@/lib/engine/terrain-meshes";
import type { MapMarkerDefinition } from "@/lib/maps/map-definition";
import { createPlacedEntity, type CollisionMode, type PlacedMapEntity, type PrimitiveType } from "@/lib/maps/map-entities";
import { getPrefabDefinition } from "@/lib/prefabs/prefab-library";
import { groundEntityOnTerrain } from "@/lib/prefabs/prefab-placement";
import { buildZoneOverlayChunkMeshes } from "@/lib/terrain/zone-overlay";
import type { CellRotation, ShapeId } from "@/lib/voxel-shapes/shape-ids";
import { getShapeDefinition } from "@/lib/voxel-shapes/shape-registry";
import { BLOCK_IDS, getBlockDefinition, type BlockId } from "@/lib/world/block-registry";
import { getTerrainSurfaceAt } from "@/lib/world/surface-query";
import { raycastVoxels } from "@/lib/world/voxel-raycast";
import { getChunkCounts, type GridCoordinate } from "@/lib/world/world-config";
import {
  affectedCount,
  appendSurfacePlate,
  brushOperation,
  effectiveBrush,
  FLATTEN_PREVIEW_COLORS,
  flattenPreviewCells,
  isSingleShot,
  previewCells,
  previewStyle,
  REPEAT_STEP_PX,
  repeatsWithCtrl,
  TOOL_COLORS,
  toolBlock,
  toolLayer,
  toolTarget,
  type EditorLayerId,
  type EditorMessage,
  type EditorTool,
} from "./editor-tools";
import { createEntityFromDraft, createPrefabEntityFromDraft } from "./entity-authoring";
import type { EditorSession, SessionChange } from "./editor-session";
import { createTerrainMutations, type TerrainBrushSettings, type TerrainCellMutation } from "./terrain-brushes";
import { createZoneColumnChanges, type ZoneEditMode, type ZoneSelectionMode } from "./zone-tools";

/**
 * The editor's 3D view. Plain three.js, no React: the UI hands it tool and
 * view settings and reads back hover, selection and messages through
 * callbacks.
 *
 * Tools and their previews are the original editor's: a ghost of the block
 * in its real shape for Add, outlined surface plates that follow slopes for
 * brushes, red and green columns for Flatten, whole-cell boxes for Erase and
 * Clear, a translucent copy of the object for Place, and a rectangle for
 * zone area fills.
 *
 * It renders on demand, and every edit costs in proportion to what changed:
 * the session reports dirty chunks and entities, and only those are rebuilt,
 * once per frame however many edits arrived in between. Previews are
 * rebuilt only when the hovered cell (or a setting) changes, never per
 * pointer move.
 */
export type { EditorTool } from "./editor-tools";

export type ToolSettings = {
  tool: EditorTool;
  /** Material for paint, add, raise and flatten. */
  blockId: BlockId;
  applyMaterialToAddedBlocks: boolean;
  shapeId: ShapeId;
  rotation: CellRotation;
  shapeState: number;
  brush: TerrainBrushSettings;
  zoneId: number;
  zoneColor: string;
  zoneEditMode: ZoneEditMode;
  zoneSelectionMode: ZoneSelectionMode;
  /** What Place puts down: a procedural prefab, a model, or a primitive when neither is set. */
  prefabId: string | null;
  modelId: string | null;
  variantId: string | null;
  primitiveType: PrimitiveType;
  entityColor: string;
  entityName: string;
  collisionMode: CollisionMode;
};

export type ViewSettings = {
  gridLines: boolean;
  gridColor: string;
  neutral: boolean;
  neutralColor: string;
  background: string;
  /** Layers: hidden layers are not drawn, locked ones cannot be edited. */
  hidden: ReadonlySet<EditorLayerId>;
  locked: ReadonlySet<EditorLayerId>;
  /** Closest the camera may get, in world units. */
  minDistance: number;
};

export type HoverInfo = { cell: GridCoordinate; affected: number };

export type ViewportCallbacks = {
  onSelectionChange: (ids: string[]) => void;
  /** The terrain cell picked with Select or last edited, or null. */
  onCellSelect: (cell: GridCoordinate | null) => void;
  /** Called when the hovered cell changes, not on every pointer move. */
  onHover: (info: HoverInfo | null) => void;
  onMessage: (message: EditorMessage) => void;
  /** A stroke or area fill has ended: counts that are not worth updating per step can be refreshed now. */
  onEditEnd?: () => void;
  /** Camera heading in radians, 0 facing north, when the camera moves. Meant for writing to the DOM directly. */
  onHeading?: (radians: number) => void;
};

export type ViewportStats = {
  frames: number;
  picks: number;
  chunkRebuilds: number;
  zoneChunkRebuilds: number;
  entityRebuilds: number;
  previewRebuilds: number;
  /** CPU time of the last frame, including any rebuilds it performed, ms. */
  lastFrameMs: number;
  /** Longest frame since `resetWorstFrame()`, ms. */
  worstFrameMs: number;
};

export type CompassDirection = "north" | "northeast" | "east" | "southeast" | "south" | "southwest" | "west" | "northwest";

export const MAX_BRUSH_SIZE = 9;
const CUBE_CAPACITY = 32 * 32;
const CLICK_SLOP_PX = 5;
const MOVE_SNAP = 0.5;
const SELECTED_CELL_COLOR = "#38bdf8";
const EDITOR_CAMERA = { panButtons: [1, 2], maxDistance: 380, minPitchDegrees: 8, maxPitchDegrees: 89, targetHeight: VISITOR_CAMERA.targetHeight, panSpeed: 1, rotateKeys: false };
const COMPASS_HEADINGS: Record<CompassDirection, number> = {
  north: 0, northeast: 45, east: 90, southeast: 135, south: 180, southwest: 225, west: 270, northwest: 315,
};

type Stroke =
  | {
      kind: "terrain";
      tool: EditorTool;
      lastKey: string;
      /** Columns already raised or lowered in this stroke, so a column moves once per stroke. */
      touched: Set<string>;
      /** Flatten keeps the height of the cell the stroke started on. */
      flattenY: number | null;
      /** Where the last repeated add or erase step happened (Ctrl strokes). */
      lastStep: { x: number; y: number } | null;
    }
  | { kind: "click"; tool: EditorTool; startX: number; startY: number }
  | { kind: "zone-area"; anchor: GridCoordinate }
  | {
      kind: "move";
      startX: number;
      startY: number;
      planeY: number;
      origin: THREE.Vector3;
      started: boolean;
      /** Where each moved object started: position, and turn for the rotate mode. */
      positions: Map<string, { x: number; z: number; ry: number }>;
    };

/** A colour shaded by the terrain shader's fixed light, so the Add ghost looks like the block it will become. */
function shade(color: THREE.Color, normal: readonly number[]) {
  const light = new THREE.Vector3(0.35, 0.8, 0.42).normalize();
  const n = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
  const factor = 0.48 + Math.max(0, n.dot(light)) * 0.52;
  return new THREE.Color(color.r * factor + 0.035, color.g * factor + 0.028, color.b * factor + 0.018);
}

export class EditorViewport {
  readonly stats: ViewportStats = { frames: 0, picks: 0, chunkRebuilds: 0, zoneChunkRebuilds: 0, entityRebuilds: 0, previewRebuilds: 0, lastFrameMs: 0, worstFrameMs: 0 };
  readonly camera: THREE.PerspectiveCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly session: EditorSession;
  private readonly terrain: TerrainSource;
  private readonly callbacks: ViewportCallbacks;
  private readonly models: ModelLibrary;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly environment: Environment;
  /** Per-model wind bindings; live values for the response, rebuild on a new weight source. */
  private readonly windModels: ModelWindRegistry;
  /** Per-model look (toon, outline, contact patch, shadows) and the map's surface style uniforms. */
  private readonly modelStyles: ModelStyleRegistry;
  private readonly shadowFocus = new THREE.Vector3();
  private readonly frustum = new THREE.Frustum();
  private readonly viewProjection = new THREE.Matrix4();
  /** A model shown in a debug view instead of its material (wind weights, vertex colours, UV sets). */
  private debugView: { modelId: string; view: Exclude<WindDebugView, "normal"> } | null = null;
  private debugMaterials: THREE.Material[] = [];
  private readonly rig: CameraRig;
  private readonly raycaster = new THREE.Raycaster();
  private readonly overlays = new THREE.Group();
  private readonly helpers = new THREE.Group();
  private readonly zoneGroup = new THREE.Group();
  private readonly zoneChunks = new Map<string, THREE.Object3D[]>();
  private readonly zoneMaterials = new Map<number, { fill: THREE.MeshBasicMaterial; line: THREE.LineBasicMaterial }>();
  /** Surface brush preview: translucent plates and their outlines, one colour per vertex. */
  private readonly plates: THREE.Mesh;
  private readonly plateLines: THREE.LineSegments;
  /** Cube preview: wireframe boxes and translucent fills, one instance per cell. */
  private readonly cubeWires: THREE.InstancedMesh;
  private readonly cubeFills: THREE.InstancedMesh;
  private readonly ghost: THREE.Mesh;
  private ghostKey = "";
  private placement: { key: string; layer: EntityLayer } | null = null;
  private readonly selectedCellBox: THREE.LineSegments;
  private readonly selectionOutline: THREE.LineSegments;
  private readonly boundsOutline: THREE.LineSegments;
  private readonly markerMeshes: THREE.InstancedMesh;
  private readonly navigationLines: THREE.LineSegments;
  private readonly resizeObserver: ResizeObserver;
  private readonly abort = new AbortController();
  private readonly unsubscribe: () => void;
  private entities: EntityLayer;
  private settings: ToolSettings;
  private view: ViewSettings;
  private selection: string[] = [];
  private selectedCell: GridCoordinate | null = null;
  private cleanPreview = false;
  private angleLocked = false;
  private transformMode: "translate" | "rotate" = "translate";
  /** Seconds into a "Preview Pop" run, or null. */
  private popClock: number | null = null;
  /** The baked terrain, while the baked view is on. Editing is off in that view. */
  private baked: TerrainSource | null = null;
  private pointer: { x: number; y: number } | null = null;
  private hover: GridCoordinate | null = null;
  private hoverKey = "";
  private stroke: Stroke | null = null;
  private readonly dirtyTerrain = new Set<string>();
  private readonly dirtyZones = new Set<string>();
  private entitiesDirty = false;
  private selectionDirty = false;
  private pickPending = false;
  private frameHandle = 0;
  private lastTickAt = 0;
  private lastHeading = Number.NaN;
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    session: EditorSession,
    terrain: TerrainSource,
    models: ModelLibrary,
    settings: ToolSettings,
    view: ViewSettings,
    callbacks: ViewportCallbacks,
  ) {
    this.canvas = canvas;
    this.session = session;
    this.terrain = terrain;
    this.settings = settings;
    this.view = view;
    this.callbacks = callbacks;
    this.models = models;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.environment = new Environment(this.scene);

    this.rig = new CameraRig(canvas, { onChange: () => this.invalidate(), ...EDITOR_CAMERA, minDistance: view.minDistance, initialDistance: 90, pitchDegrees: 35, yawDegrees: 45 });
    this.camera = this.rig.camera;

    this.environment.apply(session.getMeta().environment);
    this.windModels = new ModelWindRegistry(models, this.environment.wind, session.getMeta().modelSettings);
    this.modelStyles = new ModelStyleRegistry(models, session.getMeta().modelSettings, session.getMeta().environment.style);
    this.applyShadowAvailability();
    this.entities = buildEntityLayer(session.getEntities(), models, { wind: this.windModels.options(), style: this.modelStyles.options() });
    this.scene.add(terrain.group, this.entities.group, this.helpers, this.overlays);

    // Surface plates: depth test off, so a plate is never hidden by the block it sits on.
    const plateGeometry = new THREE.BufferGeometry();
    this.plates = new THREE.Mesh(plateGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    this.plateLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthTest: false }));
    for (const object of [this.plates, this.plateLines]) {
      object.frustumCulled = false;
      object.renderOrder = 11;
    }

    this.cubeWires = new THREE.InstancedMesh(new THREE.BoxGeometry(1.06, 1.06, 1.06), new THREE.MeshBasicMaterial({ wireframe: true, depthTest: false }), CUBE_CAPACITY);
    this.cubeFills = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 0.98, 0.98), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22, depthWrite: false }), CUBE_CAPACITY);
    for (const object of [this.cubeWires, this.cubeFills]) {
      object.count = 0;
      object.frustumCulled = false;
      object.renderOrder = 10;
    }

    this.ghost = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.ghost.visible = false;
    this.ghost.renderOrder = 12;

    const outline = (color: string, depthTest = false) => {
      const line = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color, depthTest, transparent: true }));
      line.frustumCulled = false;
      return line;
    };
    this.selectionOutline = outline("#ffd24a");
    this.selectionOutline.renderOrder = 13;
    this.boundsOutline = outline("#ff6b4a", true);
    this.boundsOutline.renderOrder = 2;
    this.selectedCellBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.06, 1.06, 1.06)), new THREE.LineBasicMaterial({ color: SELECTED_CELL_COLOR, depthTest: false }));
    this.selectedCellBox.visible = false;
    this.selectedCellBox.renderOrder = 13;

    this.markerMeshes = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({ color: TOOL_COLORS.marker }), 256);
    this.markerMeshes.count = 0;
    this.markerMeshes.frustumCulled = false;
    this.navigationLines = outline(TOOL_COLORS.navigation);

    this.overlays.add(this.zoneGroup, this.plates, this.plateLines, this.cubeFills, this.cubeWires, this.ghost, this.selectionOutline, this.selectedCellBox, this.boundsOutline);
    this.helpers.add(this.markerMeshes, this.navigationLines);

    this.applyMeta();
    const counts = getChunkCounts(session.world.config);
    for (let chunkZ = 0; chunkZ < counts.z; chunkZ += 1) {
      for (let chunkX = 0; chunkX < counts.x; chunkX += 1) this.rebuildZoneChunk(session.world.getChunkId(chunkX, chunkZ));
    }
    this.stats.zoneChunkRebuilds = 0;
    this.rig.setBounds({ minX: -session.world.config.width / 2, maxX: session.world.config.width / 2, minZ: -session.world.config.depth / 2, maxZ: session.world.config.depth / 2 });
    this.setView(view);
    this.startView();

    this.unsubscribe = session.subscribe((change) => this.onSessionChange(change));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.bind();
    this.invalidate();
    this.warmMesher();
  }

  /**
   * The map was meshed in a worker, so the first edit would run the mesher on
   * this thread for the first time, unoptimised, and cost a visible hitch.
   * Rebuilding a few chunks in place while the editor is idle (the result is
   * identical) lets the engine optimise that code before the first stroke.
   */
  private warmMesher() {
    const counts = getChunkCounts(this.session.world.config);
    const centre = [Math.floor(counts.x / 2), Math.floor(counts.z / 2)];
    const ids = [[0, 0], [-1, 0], [0, -1], [-1, -1]].map(([dx, dz]) => this.session.world.getChunkId(centre[0] + dx, centre[1] + dz));
    let pass = 0;
    const step = () => {
      if (this.disposed || this.stroke) return;
      this.terrain.rebuildChunks([ids[pass % ids.length]]);
      pass += 1;
      if (pass < 12) schedule();
      else this.invalidate();
    };
    const schedule = () => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(step, { timeout: 500 }) : window.setTimeout(step, 50));
    schedule();
  }

  // --- settings from the UI ------------------------------------------------------

  setSettings(settings: ToolSettings) {
    const toolChanged = settings.tool !== this.settings.tool;
    this.settings = settings;
    if (toolChanged && this.stroke?.kind !== "move") this.stroke = null;
    this.hoverKey = "";
    this.ghostKey = "";
    this.schedulePick();
  }

  setView(view: ViewSettings) {
    this.view = view;
    const editor = this.terrain.editorUniforms;
    if (editor) {
      editor.uGridLines.value = view.gridLines ? 1 : 0;
      editor.uGridColor.value.set(view.gridColor);
      editor.uNeutral.value = view.neutral ? 1 : 0;
      editor.uNeutralColor.value.set(view.neutralColor);
    }
    this.environment.background.set(view.background);
    this.zoneGroup.visible = !view.hidden.has("zones") && this.baked === null;
    this.entities.group.visible = !view.hidden.has("entities");
    this.markerMeshes.visible = !view.hidden.has("markers");
    this.navigationLines.visible = !view.hidden.has("navigation");
    this.terrain.group.visible = !view.hidden.has("terrain") && this.baked === null;
    if (!this.angleLocked) this.rig.configure({ minDistance: view.minDistance });
    this.hoverKey = "";
    this.schedulePick();
    this.invalidate();
  }

  setSelection(ids: string[]) {
    this.selection = ids.filter((id) => this.session.getEntity(id));
    this.selectionDirty = true;
    this.invalidate();
  }

  setSelectedCell(cell: GridCoordinate | null) {
    this.selectedCell = cell;
    this.updateSelectedCellBox();
    this.invalidate();
  }

  /** Clean preview: the map without any editor overlay. */
  setCleanPreview(clean: boolean) {
    this.cleanPreview = clean;
    this.overlays.visible = !clean;
    this.helpers.visible = !clean;
    this.stroke = null;
    this.hoverKey = "";
    this.clearPreview();
    this.invalidate();
  }

  get isBakedView() {
    return this.baked !== null;
  }

  /**
   * Shows a baked world file in place of the voxel terrain, or the voxels
   * again with null. The baked view is for looking: tools are off until the
   * voxels are back.
   */
  setBakedView(file: ArrayBuffer | null) {
    if (this.baked) {
      this.scene.remove(this.baked.group);
      this.baked.dispose();
      this.baked = null;
    }
    if (file) {
      this.baked = createBakedTerrain(decodeBakedWorld(file));
      this.scene.add(this.baked.group);
    }
    this.terrain.group.visible = this.baked === null && !this.view.hidden.has("terrain");
    this.zoneGroup.visible = this.baked === null && !this.view.hidden.has("zones");
    this.stroke = null;
    this.hoverKey = "";
    this.clearPreview();
    this.callbacks.onHover(null);
    this.canvas.style.cursor = "default";
    this.invalidate();
  }

  // --- camera ----------------------------------------------------------------------

  /**
   * The original editor opened where the visitor stands: low over the
   * ground at the spawn, looking across the map.
   */
  private startView() {
    const meta = this.session.getMeta();
    const spawn = meta.spawnPoints.find((candidate) => candidate.id === meta.defaultSpawnId) ?? meta.spawnPoints[0];
    const { width, depth } = this.session.world.config;
    this.rig.setOrientation(VISITOR_CAMERA.yawDegrees, VISITOR_CAMERA.pitchDegrees, true);
    if (spawn) {
      const target = spawn.cameraTarget ?? spawn.position;
      this.rig.lookAt(target.x + 0.5 - width / 2, target.z + 0.5 - depth / 2, VISITOR_CAMERA.initialDistance, true);
    } else {
      this.frameAll(true);
    }
  }

  /** Centres the camera on the playable area. */
  frameAll(immediate = false) {
    const bounds = this.playableWorldBounds();
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    this.rig.lookAt((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2, THREE.MathUtils.clamp(span * 1.1, 30, EDITOR_CAMERA.maxDistance), immediate);
  }

  focusEntity(id: string) {
    const entity = this.session.getEntity(id);
    if (entity) this.rig.lookAt(entity.transform.position.x, entity.transform.position.z, 40);
  }

  /** Centres the camera on a set of columns, from a compass direction. */
  focusColumns(columns: GridCoordinate[], direction: CompassDirection) {
    if (columns.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const column of columns) {
      minX = Math.min(minX, column.x); maxX = Math.max(maxX, column.x);
      minZ = Math.min(minZ, column.z); maxZ = Math.max(maxZ, column.z);
    }
    const { width, depth } = this.session.world.config;
    const span = Math.max(maxX - minX + 1, maxZ - minZ + 1);
    this.snapCompass(direction);
    this.rig.lookAt((minX + maxX + 1) / 2 - width / 2, (minZ + maxZ + 1) / 2 - depth / 2, THREE.MathUtils.clamp(span * 2.15 + 18, 24, 96));
  }

  /** Turns the camera to face a compass direction. */
  snapCompass(direction: CompassDirection) {
    // The rig's yaw is where the camera stands; facing north means standing south.
    this.rig.setOrientation(-COMPASS_HEADINGS[direction], undefined);
  }

  /** Mouse sensitivity from the Settings menu; 1 is the default. */
  setPanSpeed(pan: number, rotate: number) {
    this.rig.configure({ panSpeed: pan, rotateSpeed: rotate });
  }

  /** Dragging a selected object moves it, or turns it about its vertical axis. */
  setTransformMode(mode: "translate" | "rotate") {
    this.transformMode = mode;
  }

  /** Plays the objects' pop-up, as visitors see it when they enter. */
  playPop() {
    this.popClock = 0;
    this.entities.setPopTime(-1);
    this.invalidate();
  }

  /** Keeps the current tilt while rotating and zooming, or frees it again. */
  setAngleLocked(locked: boolean) {
    this.angleLocked = locked;
    const pitch = this.rig.getGoal().pitchDegrees;
    this.rig.configure(locked
      ? { minPitchDegrees: pitch, maxPitchDegrees: pitch }
      : { minPitchDegrees: EDITOR_CAMERA.minPitchDegrees, maxPitchDegrees: EDITOR_CAMERA.maxPitchDegrees });
  }

  /** Client coordinates of a world point. Used by tests. */
  project(x: number, y: number, z: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.updateMatrixWorld();
    const ndc = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: rect.left + ((ndc.x + 1) / 2) * rect.width, y: rect.top + ((1 - ndc.y) / 2) * rect.height };
  }

  resetWorstFrame() {
    this.stats.worstFrameMs = 0;
  }

  invalidate() {
    if (this.disposed || this.frameHandle) return;
    this.frameHandle = requestAnimationFrame((time) => this.tick(time));
  }

  /** Rebuilds the objects, e.g. after a model finished loading. */
  refreshEntities() {
    this.entitiesDirty = true;
    this.placement = null;
    this.hoverKey = "";
    this.invalidate();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.abort.abort();
    this.unsubscribe();
    this.resizeObserver.disconnect();
    this.rig.dispose();
    this.entities.dispose();
    this.placement?.layer.dispose();
    this.baked?.dispose();
    this.terrain.dispose();
    for (const id of [...this.zoneChunks.keys()]) this.clearZoneChunk(id);
    this.zoneMaterials.forEach(({ fill, line }) => {
      fill.dispose();
      line.dispose();
    });
    for (const object of [this.plates, this.plateLines, this.cubeWires, this.cubeFills, this.ghost, this.selectionOutline, this.boundsOutline, this.selectedCellBox, this.markerMeshes, this.navigationLines]) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
  }

  // --- frame -----------------------------------------------------------------

  private tick(time: number) {
    this.frameHandle = 0;
    const startedAt = performance.now();
    const delta = this.lastTickAt ? Math.min(0.1, (time - this.lastTickAt) / 1000) : 1 / 60;
    this.lastTickAt = time;

    if (this.dirtyTerrain.size > 0) {
      this.terrain.rebuildChunks(this.dirtyTerrain);
      this.stats.chunkRebuilds += this.dirtyTerrain.size;
      // The zone overlay sits on the terrain surface, so it follows terrain edits.
      for (const id of this.dirtyTerrain) this.dirtyZones.add(id);
      this.dirtyTerrain.clear();
    }
    if (this.dirtyZones.size > 0) {
      for (const id of this.dirtyZones) this.rebuildZoneChunk(id);
      this.dirtyZones.clear();
    }
    if (this.entitiesDirty) {
      this.entitiesDirty = false;
      this.scene.remove(this.entities.group);
      this.entities.dispose();
      this.entities = buildEntityLayer(this.session.getEntities(), this.models, { wind: this.windModels.options(), style: this.modelStyles.options() });
      this.entities.group.visible = !this.view.hidden.has("entities");
      this.scene.add(this.entities.group);
      this.applyDebugView();
      this.stats.entityRebuilds += 1;
      this.selectionDirty = true;
    }
    if (this.selectionDirty) {
      this.selectionDirty = false;
      this.rebuildSelectionOutline();
    }
    if (this.pickPending) {
      this.pickPending = false;
      this.updateHover();
    }

    const moving = this.rig.update(delta);
    let animating = this.entities.update(delta);
    if (this.environment.wind.active && this.entities.group.visible) {
      this.camera.updateMatrixWorld();
      this.viewProjection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.viewProjection);
      if (this.entities.windInView(this.frustum)) animating = true;
    }
    this.environment.update(this.lastTickAt / 1000, delta);
    if (this.renderer.shadowMap.enabled) {
      const view = this.rig.getView();
      this.environment.followView(this.shadowFocus.set(view.x, 0, view.z), view.distance);
    }
    if (this.popClock !== null) {
      this.popClock += delta;
      const done = this.popClock > this.entities.popDuration + 0.1;
      this.entities.setPopTime(done ? POP_COMPLETE : this.popClock);
      if (done) this.popClock = null;
      animating = true;
    }
    this.renderer.render(this.scene, this.camera);
    this.stats.frames += 1;
    this.stats.lastFrameMs = performance.now() - startedAt;
    this.stats.worstFrameMs = Math.max(this.stats.worstFrameMs, this.stats.lastFrameMs);
    this.reportHeading();
    if (moving) this.schedulePick();
    if (moving || animating) this.invalidate();
    else this.lastTickAt = 0;
  }

  private reportHeading() {
    if (!this.callbacks.onHeading) return;
    const heading = THREE.MathUtils.degToRad(-this.rig.getView().yawDegrees);
    const normalized = ((heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (Math.abs(normalized - this.lastHeading) < 0.002) return;
    this.lastHeading = normalized;
    this.callbacks.onHeading(normalized);
  }

  private resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.rig.setAspect(width / height);
    this.modelStyles?.surface.setViewport(this.camera.fov, height);
    this.invalidate();
  }

  /** Shadow maps follow the map's setting; switching them recompiles the lit materials (editor only). */
  private applyShadowAvailability() {
    const enabled = this.environment.shadowsEnabled;
    if (this.renderer.shadowMap.enabled === enabled) return;
    this.renderer.shadowMap.enabled = enabled;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      for (const item of Array.isArray(material) ? material : material ? [material] : []) item.needsUpdate = true;
    });
  }

  private onSessionChange(change: SessionChange) {
    for (const id of change.terrainChunks) this.dirtyTerrain.add(id);
    for (const id of change.zoneChunks) this.dirtyZones.add(id);
    if (change.entitiesStructural || change.entitiesUpdated.length > 0) this.entitiesDirty = true;
    if (change.entitiesStructural) {
      const kept = this.selection.filter((id) => this.session.getEntity(id));
      if (kept.length !== this.selection.length) {
        this.selection = kept;
        this.callbacks.onSelectionChange(kept);
      }
    }
    if (change.meta) this.applyMeta();
    // What is under the pointer may have changed shape: previews follow.
    this.hoverKey = "";
    this.schedulePick();
    this.invalidate();
  }

  // --- map-level state ---------------------------------------------------------

  private playableWorldBounds() {
    const { width, depth } = this.session.world.config;
    const bounds = this.session.getMeta().playableBounds;
    return {
      minX: bounds.minX - width / 2,
      maxX: bounds.maxX + 1 - width / 2,
      minZ: bounds.minZ - depth / 2,
      maxZ: bounds.maxZ + 1 - depth / 2,
    };
  }

  /** Shows every instance of a model in a debug view; "normal" (or no model) restores its material. */
  setModelDebugView(modelId: string | null, view: WindDebugView) {
    this.debugView = modelId && view !== "normal" ? { modelId, view } : null;
    this.applyDebugView();
    this.invalidate();
  }

  private applyDebugView() {
    this.entities.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.userData.originalMaterial) {
        mesh.material = mesh.userData.originalMaterial as THREE.Material;
        delete mesh.userData.originalMaterial;
      }
    });
    this.debugMaterials.forEach((material) => material.dispose());
    this.debugMaterials = [];
    const debug = this.debugView;
    const entry = debug ? this.models.entry(debug.modelId) : null;
    if (!debug || !entry) return;
    const binding = this.windModels.forModel(debug.modelId);
    for (const mesh of this.entities.modelMeshes(debug.modelId)) {
      const original = mesh.material as THREE.Material;
      const material = createWindDebugMaterial(debug.view, original, binding, entry.bounds, this.environment.wind.uniforms);
      mesh.userData.originalMaterial = original;
      mesh.material = material;
      this.debugMaterials.push(material);
    }
  }

  private applyMeta() {
    const meta = this.session.getMeta();
    this.environment.apply(meta.environment);
    // Response values are uniforms; a new weight source is a new shader.
    if (this.windModels.update(meta.modelSettings)) this.entitiesDirty = true;
    // Surface values are uniforms; a model's shading, outline, patch or shadow casting are batches.
    this.modelStyles?.applySurface(meta.environment.style);
    if (this.modelStyles?.update(meta.modelSettings)) this.entitiesDirty = true;
    this.applyShadowAvailability();
    this.environment.background.set(this.view?.background ?? "#edf1ed");
    for (const zone of meta.zones) {
      const materials = this.zoneMaterials.get(zone.numericId);
      if (materials) {
        materials.fill.color.set(zone.color);
        materials.line.color.set(zone.color);
        const visible = zone.overlayVisible !== false;
        materials.fill.visible = visible;
        materials.line.visible = visible;
      }
    }
    const { minX, maxX, minZ, maxZ } = this.playableWorldBounds();
    const y = 1.05;
    const corners = [minX, y, minZ, maxX, y, minZ, maxX, y, minZ, maxX, y, maxZ, maxX, y, maxZ, minX, y, maxZ, minX, y, maxZ, minX, y, minZ];
    this.boundsOutline.geometry.setAttribute("position", new THREE.Float32BufferAttribute(corners, 3));
    this.rebuildMarkers(meta.markers);
    this.rebuildNavigation();
  }

  private rebuildMarkers(markers: readonly MapMarkerDefinition[]) {
    const matrix = new THREE.Matrix4();
    const count = Math.min(markers.length, this.markerMeshes.instanceMatrix.count);
    for (let index = 0; index < count; index += 1) {
      const { x, y, z } = markers[index].gridPosition;
      const centre = this.session.world.gridToWorld(x, y, z);
      matrix.makeTranslation(centre.x, centre.y + 0.1, centre.z);
      this.markerMeshes.setMatrixAt(index, matrix);
    }
    this.markerMeshes.count = count;
    this.markerMeshes.instanceMatrix.needsUpdate = true;
  }

  private rebuildNavigation() {
    const { nodes, edges } = this.session.getMeta().navigation;
    const byId = new Map(nodes.map((node) => [node.id, node.position]));
    const positions: number[] = [];
    const cross = 0.3;
    for (const node of nodes) {
      const { x, y, z } = node.position;
      positions.push(x - cross, y + 0.05, z, x + cross, y + 0.05, z, x, y + 0.05, z - cross, x, y + 0.05, z + cross);
    }
    for (const edge of edges) {
      const from = byId.get(edge.fromNodeId);
      const to = byId.get(edge.toNodeId);
      if (from && to) positions.push(from.x, from.y + 0.05, from.z, to.x, to.y + 0.05, to.z);
    }
    this.navigationLines.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  }

  private zoneMaterial(numericId: number) {
    let materials = this.zoneMaterials.get(numericId);
    if (!materials) {
      const zone = this.session.getMeta().zones.find((candidate) => candidate.numericId === numericId);
      const color = zone?.color ?? "#ff00ff";
      materials = {
        fill: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, depthWrite: false }),
        line: new THREE.LineBasicMaterial({ color }),
      };
      materials.fill.visible = materials.line.visible = zone?.overlayVisible !== false;
      this.zoneMaterials.set(numericId, materials);
    }
    return materials;
  }

  private clearZoneChunk(id: string) {
    for (const object of this.zoneChunks.get(id) ?? []) {
      this.zoneGroup.remove(object);
      (object as THREE.Mesh).geometry.dispose();
    }
    this.zoneChunks.delete(id);
  }

  private rebuildZoneChunk(id: string) {
    const match = /^chunk-(\d+)-(\d+)$/.exec(id);
    if (!match) return;
    this.clearZoneChunk(id);
    const objects: THREE.Object3D[] = [];
    for (const data of buildZoneOverlayChunkMeshes(this.session.world, Number(match[1]), Number(match[2]))) {
      const materials = this.zoneMaterial(data.zoneId);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      const fill = new THREE.Mesh(geometry, materials.fill);
      fill.matrixAutoUpdate = false;
      fill.renderOrder = 1;
      objects.push(fill);
      if (data.boundaryPositions.length > 0) {
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute("position", new THREE.BufferAttribute(data.boundaryPositions, 3));
        const lines = new THREE.LineSegments(lineGeometry, materials.line);
        lines.matrixAutoUpdate = false;
        objects.push(lines);
      }
    }
    if (objects.length > 0) {
      this.zoneChunks.set(id, objects);
      this.zoneGroup.add(...objects);
    }
    this.stats.zoneChunkRebuilds += 1;
  }

  private rebuildSelectionOutline() {
    const positions: number[] = [];
    for (const id of this.selection) {
      const box = this.entities.bounds.get(id);
      if (!box) continue;
      const { min, max } = box;
      const corner = (index: number) => [index & 1 ? max.x : min.x, index & 2 ? max.y : min.y, index & 4 ? max.z : min.z];
      for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) {
        positions.push(...corner(a), ...corner(b));
      }
    }
    this.selectionOutline.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  }

  private updateSelectedCellBox() {
    const cell = this.selectedCell;
    this.selectedCellBox.visible = cell !== null;
    if (!cell) return;
    const centre = this.session.world.gridToWorld(cell.x, cell.y, cell.z);
    this.selectedCellBox.position.set(centre.x, centre.y, centre.z);
  }

  // --- picking -----------------------------------------------------------------

  private setRay(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, 1 - ((clientY - rect.top) / rect.height) * 2);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray;
  }

  private pickVoxel(ray: THREE.Ray) {
    this.stats.picks += 1;
    return raycastVoxels(this.session.world, ray.origin, ray.direction, 900);
  }

  private pickEntity(ray: THREE.Ray) {
    if (this.view.hidden.has("entities")) return null;
    let best: { id: string; distance: number; point: THREE.Vector3 } | null = null;
    const point = new THREE.Vector3();
    for (const [id, box] of this.entities.bounds) {
      if (!ray.intersectBox(box, point)) continue;
      const distance = point.distanceTo(ray.origin);
      if (!best || distance < best.distance) best = { id, distance, point: point.clone() };
    }
    return best;
  }

  /** Where a ray meets the ground plane, as the column's top cell. Raise, lower and markers work off the terrain's edge too. */
  private groundCell(ray: THREE.Ray): GridCoordinate | null {
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    const t = -ray.origin.y / ray.direction.y;
    if (t <= 0) return null;
    const { width, depth } = this.session.world.config;
    const x = Math.floor(ray.origin.x + ray.direction.x * t + width / 2);
    const z = Math.floor(ray.origin.z + ray.direction.z * t + depth / 2);
    if (x < 0 || x >= width || z < 0 || z >= depth) return null;
    return { x, y: Math.max(0, this.session.world.getHighestNonAirY(x, z) ?? 0), z };
  }

  /** The cell under the pointer for the active tool: the cell in front of the hit face for Add, the hit cell otherwise. */
  private hoveredCell(ray: THREE.Ray): GridCoordinate | null {
    const { tool } = this.settings;
    const hit = this.pickVoxel(ray);
    if (!hit) return tool === "raise" || tool === "lower" || tool === "marker" ? this.groundCell(ray) : null;
    if (tool === "add") {
      const target = { x: hit.cell.x + hit.normal.x, y: hit.cell.y + hit.normal.y, z: hit.cell.z + hit.normal.z };
      return this.session.world.isInsideWorld(target.x, target.y, target.z) ? target : null;
    }
    return hit.cell;
  }

  private schedulePick() {
    if (!this.pointer || this.baked) return;
    this.pickPending = true;
    this.invalidate();
  }

  private brushFor(tool: EditorTool) {
    return effectiveBrush(tool, this.settings.brush);
  }

  private previewInput(tool: EditorTool, center: GridCoordinate) {
    return {
      world: this.session.world,
      tool,
      center,
      settings: this.brushFor(tool),
      blockId: toolBlock(tool, this.settings.blockId, this.settings.applyMaterialToAddedBlocks),
      zoneId: this.settings.zoneId,
      zoneSelectionMode: this.settings.zoneSelectionMode,
      zoneAnchor: this.stroke?.kind === "zone-area" ? this.stroke.anchor : null,
    };
  }

  private updateHover() {
    if (!this.pointer || this.baked || this.cleanPreview) {
      this.clearPreview();
      return;
    }
    const ray = this.setRay(this.pointer.x, this.pointer.y);
    const { tool } = this.settings;

    // Select: an object under the pointer wins over the terrain behind it.
    if (tool === "select") {
      const entity = this.pickEntity(ray);
      const voxel = this.pickVoxel(ray);
      if (entity && (!voxel || entity.distance <= voxel.distance)) {
        this.canvas.style.cursor = "pointer";
        if (this.hoverKey === `e:${entity.id}`) return;
        this.hoverKey = `e:${entity.id}`;
        this.hover = null;
        this.clearPreview();
        this.callbacks.onHover(null);
        return;
      }
    }

    this.canvas.style.cursor = tool === "select" ? "default" : "crosshair";
    const cell = this.hoveredCell(ray);
    const s = this.settings;
    const anchor = this.stroke?.kind === "zone-area" ? this.stroke.anchor : null;
    const key = cell
      ? `${tool}:${cell.x},${cell.y},${cell.z}:${s.brush.shape}:${s.brush.size}:${s.blockId}:${s.shapeId}:${s.rotation}:${s.shapeState}:${s.zoneEditMode}:${s.zoneSelectionMode}:${anchor ? `${anchor.x},${anchor.z}` : ""}:${s.prefabId}:${s.modelId}:${s.variantId}:${s.primitiveType}:${s.entityColor}:${this.view.hidden.has("developmentHelpers")}`
      : "";
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    this.hover = cell;
    if (!cell) {
      this.clearPreview();
      this.callbacks.onHover(null);
      return;
    }
    const input = this.previewInput(tool, cell);
    this.callbacks.onHover({ cell, affected: brushOperation(tool) || tool === "zone" ? affectedCount(input) : 1 });
    this.buildPreview(tool, cell, input);
  }

  private clearPreview() {
    this.hover = null;
    this.setPlates([], [], []);
    this.setCubes([]);
    this.ghost.visible = false;
    if (this.placement) this.placement.layer.group.visible = false;
    this.invalidate();
  }

  /** The original's previews, built for the hovered cell. */
  private buildPreview(tool: EditorTool, cell: GridCoordinate, input: ReturnType<EditorViewport["previewInput"]>) {
    this.stats.previewRebuilds += 1;
    const helpers = !this.view.hidden.has("developmentHelpers");
    const world = this.session.world;
    const plateFill: number[] = [];
    const plateLines: number[] = [];
    const plateColors: Array<{ color: THREE.Color; fill: number; lines: number }> = [];
    const cubes: Array<{ cell: GridCoordinate; color: THREE.Color; filled: boolean }> = [];
    const addPlate = (x: number, z: number, color: THREE.Color) => {
      const fill = plateFill.length;
      const lines = plateLines.length;
      if (appendSurfacePlate(world, x, z, plateFill, plateLines)) {
        plateColors.push({ color, fill: (plateFill.length - fill) / 3, lines: (plateLines.length - lines) / 3 });
        return true;
      }
      return false;
    };

    // Place shows the object itself; Add shows the block's ghost. The other tools outline what they act on.
    this.ghost.visible = false;
    if (this.placement) this.placement.layer.group.visible = false;
    if (tool === "entity") {
      if (!this.view.hidden.has("entities") && !this.view.locked.has("entities")) this.showPlacement(cell);
    } else if (tool === "add") {
      if (helpers) this.showGhost(cell);
    } else if (helpers) {
      const zoneColor = new THREE.Color(this.settings.zoneEditMode === "erase" ? "#facc15" : this.settings.zoneColor || TOOL_COLORS.zone);
      const color = new THREE.Color(tool === "zone" ? zoneColor : TOOL_COLORS[tool]);
      if (tool === "flatten") {
        for (const preview of flattenPreviewCells(world, cell, input.settings)) {
          const previewColor = new THREE.Color(FLATTEN_PREVIEW_COLORS[preview.action]);
          if (!preview.hasSurface || !addPlate(preview.coordinate.x, preview.coordinate.z, previewColor)) {
            cubes.push({ cell: preview.coordinate, color: previewColor, filled: true });
          }
        }
      } else if (previewStyle(tool) === "cube") {
        for (const target of previewCells(input)) cubes.push({ cell: target, color, filled: true });
      } else {
        for (const target of previewCells(input)) addPlate(target.x, target.z, color);
      }
    }

    const fillColors: number[] = [];
    const lineColors: number[] = [];
    for (const plate of plateColors) {
      for (let index = 0; index < plate.fill; index += 1) fillColors.push(plate.color.r, plate.color.g, plate.color.b);
      for (let index = 0; index < plate.lines; index += 1) lineColors.push(plate.color.r, plate.color.g, plate.color.b);
    }
    this.setPlates(plateFill, plateLines, [fillColors, lineColors]);
    this.setCubes(cubes);
    this.invalidate();
  }

  private setPlates(fill: number[], lines: number[], colors: number[][]) {
    const fillGeometry = this.plates.geometry;
    const lineGeometry = this.plateLines.geometry;
    fillGeometry.setAttribute("position", new THREE.Float32BufferAttribute(fill, 3));
    fillGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors[0] ?? [], 3));
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    lineGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors[1] ?? [], 3));
  }

  private setCubes(cubes: Array<{ cell: GridCoordinate; color: THREE.Color; filled: boolean }>) {
    const count = Math.min(cubes.length, CUBE_CAPACITY);
    const matrix = new THREE.Matrix4();
    let fills = 0;
    for (let index = 0; index < count; index += 1) {
      const { cell, color, filled } = cubes[index];
      const centre = this.session.world.gridToWorld(cell.x, cell.y, cell.z);
      matrix.makeTranslation(centre.x, centre.y, centre.z);
      this.cubeWires.setMatrixAt(index, matrix);
      this.cubeWires.setColorAt(index, color);
      if (filled) {
        this.cubeFills.setMatrixAt(fills, matrix);
        this.cubeFills.setColorAt(fills, color);
        fills += 1;
      }
    }
    this.cubeWires.count = count;
    this.cubeFills.count = fills;
    for (const mesh of [this.cubeWires, this.cubeFills]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** The block Add would place, in its real shape, rotation and state, in its material's colour. */
  private showGhost(cell: GridCoordinate) {
    const { shapeId, rotation, shapeState, blockId, applyMaterialToAddedBlocks } = this.settings;
    const block = toolBlock("add", blockId, applyMaterialToAddedBlocks);
    const key = `${shapeId}:${rotation}:${shapeState}:${block}`;
    if (key !== this.ghostKey) {
      this.ghostKey = key;
      const color = new THREE.Color(getBlockDefinition(block).developmentColor);
      const positions: number[] = [];
      const colors: number[] = [];
      for (const face of getShapeDefinition(shapeId).faces(rotation, shapeState)) {
        const faceColor = shade(color, face.normal);
        for (const index of [0, 1, 2, 0, 2, 3]) {
          const corner = face.corners[index % face.corners.length];
          positions.push(corner[0] * 1.01, corner[1] * 1.01, corner[2] * 1.01);
          colors.push(faceColor.r, faceColor.g, faceColor.b);
        }
      }
      this.ghost.geometry.dispose();
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      this.ghost.geometry = geometry;
    }
    const centre = this.session.world.gridToWorld(cell.x, cell.y, cell.z);
    this.ghost.position.set(centre.x, centre.y, centre.z);
    this.ghost.visible = true;
  }

  /** A translucent copy of what Place would put down, standing on the hovered column. */
  private showPlacement(cell: GridCoordinate) {
    const surface = getTerrainSurfaceAt(this.session.world, cell.x, cell.z);
    if (!surface.valid) return;
    const s = this.settings;
    const key = `${s.prefabId}:${s.modelId}:${s.variantId}:${s.primitiveType}:${s.entityColor}`;
    if (this.placement?.key !== key) {
      this.placement?.layer.dispose();
      if (this.placement) this.overlays.remove(this.placement.layer.group);
      const draft = this.draftEntity({ x: 0, y: 0, z: 0 });
      if (!draft) {
        this.placement = null;
        return;
      }
      const layer = buildEntityLayer([draft], this.models);
      const tint = new THREE.Color(s.entityColor);
      layer.group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          material.transparent = true;
          material.opacity = 0.38;
          material.depthWrite = false;
          // Procedural objects show in the draft colour, as in the original; models keep their own.
          const basic = material as THREE.MeshBasicMaterial;
          if (!s.modelId && basic.color) basic.color.copy(tint);
        }
        mesh.renderOrder = 11;
      });
      this.placement = { key, layer };
      this.overlays.add(layer.group);
    }
    const { x, y, z } = surface.worldPosition;
    this.placement.layer.group.position.set(x, y, z);
    this.placement.layer.group.visible = true;
  }

  /** The entity Place would create, standing at `position` (its base). Null when nothing is chosen. */
  private draftEntity(position: { x: number; y: number; z: number }): PlacedMapEntity | null {
    const s = this.settings;
    const taken = new Set(this.session.getEntities().map((entity) => entity.id));
    const transform = { position: { ...position }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
    if (s.modelId) {
      const entry = this.models.entry(s.modelId);
      if (!entry) return null;
      const variant = entry.variants.find((candidate) => candidate.id === s.variantId);
      const scale = entry.scale * (variant?.scale ?? 1);
      const size = [0, 1, 2].map((axis) => Math.max(0.1, (entry.bounds.max[axis] - entry.bounds.min[axis]) * scale));
      let id = entry.id;
      for (let suffix = 2; taken.has(id); suffix += 1) id = `${entry.id}-${suffix}`;
      if (entry.anchor === "center") transform.position.y += size[1] / 2;
      return createPlacedEntity({
        id,
        name: entry.name,
        entityType: "model",
        assetReference: entry.id,
        variantId: variant?.id,
        transform,
        placement: { anchor: entry.anchor, snapToGrid: true, surfaceAttached: true, surfaceOffset: 0 },
        footprint: { width: size[0], height: size[1], depth: size[2] },
        collisionMode: entry.collision,
        tags: ["model", ...entry.tags],
      });
    }
    const prefab = s.prefabId ? getPrefabDefinition(s.prefabId) : null;
    if (prefab) {
      return createPrefabEntityFromDraft({
        prefabId: prefab.id,
        variantId: s.variantId ?? prefab.defaultVariantId,
        name: prefab.name,
        transform,
      }, taken);
    }
    return createEntityFromDraft({
      primitiveType: s.primitiveType,
      name: s.entityName || "Placeholder",
      transform,
      color: s.entityColor,
      collisionMode: s.collisionMode,
    }, taken);
  }

  // --- applying tools -------------------------------------------------------------

  private locked(tool: EditorTool) {
    if (!this.view.locked.has(toolLayer(tool))) return false;
    this.callbacks.onMessage({ type: "error", text: "The active editor layer is locked." });
    return true;
  }

  /** One application of a terrain tool, at the cell under the pointer. */
  private applyTerrain(tool: EditorTool, cell: GridCoordinate) {
    const operation = brushOperation(tool);
    if (!operation) return;
    const world = this.session.world;
    const target = toolTarget(world, tool, cell);
    if (!target) return;
    const stroke = this.stroke?.kind === "terrain" ? this.stroke : null;
    const brush = this.brushFor(tool);
    const s = this.settings;
    const blockId = toolBlock(tool, s.blockId, s.applyMaterialToAddedBlocks);
    let mutations: TerrainCellMutation[];

    if (tool === "raise" || tool === "lower") {
      // Each column moves once per stroke, however often the brush passes over it.
      const touched = stroke?.touched ?? new Set<string>();
      mutations = [];
      for (const column of this.brushColumns(target, brush)) {
        const key = `${column.x},${column.z}`;
        if (touched.has(key)) continue;
        touched.add(key);
        const top = world.getHighestNonAirY(column.x, column.z);
        mutations.push(...createTerrainMutations({
          world, operation, center: { x: column.x, y: top ?? world.config.minY, z: column.z }, settings: { shape: "single", size: 1 },
          blockId: tool === "raise" ? blockId : BLOCK_IDS.Air, shapeId: s.shapeId, rotation: s.rotation, state: s.shapeState, zoneId: s.zoneId,
        }));
      }
    } else {
      const center = tool === "flatten" && stroke?.flattenY != null ? { ...target, y: stroke.flattenY } : target;
      mutations = createTerrainMutations({
        world, operation, center, settings: brush, blockId, shapeId: s.shapeId, rotation: s.rotation, state: s.shapeState, zoneId: s.zoneId,
      });
      if (tool === "add") mutations = mutations.filter((mutation) => mutation.beforeBlock === BLOCK_IDS.Air);
    }
    if (mutations.length === 0) return;
    this.session.applyTerrain(TERRAIN_LABELS[tool], mutations);
    this.selectedCell = target;
    this.updateSelectedCellBox();
    // During a stroke the UI hears about the selected cell once, when the stroke ends.
    if (!stroke) this.callbacks.onCellSelect(target);
  }

  private brushColumns(center: GridCoordinate, brush: TerrainBrushSettings) {
    const radius = brush.shape === "single" || brush.size <= 1 ? 0 : Math.floor(brush.size / 2);
    const { width, depth } = this.session.world.config;
    const columns: GridCoordinate[] = [];
    for (let z = center.z - radius; z <= center.z + radius; z += 1) {
      for (let x = center.x - radius; x <= center.x + radius; x += 1) {
        if (x < 0 || z < 0 || x >= width || z >= depth) continue;
        if (brush.shape === "circle" && Math.hypot(x - center.x, z - center.z) > radius + 0.001) continue;
        columns.push({ x, y: center.y, z });
      }
    }
    return columns;
  }

  private applyZone(columns: GridCoordinate[]) {
    const s = this.settings;
    if (s.zoneId <= 0 || !this.session.getMeta().zones.some((zone) => zone.numericId === s.zoneId)) {
      this.callbacks.onMessage({ type: "error", text: "Select a zone before painting zones." });
      return;
    }
    const zone = this.session.getMeta().zones.find((candidate) => candidate.numericId === s.zoneId);
    if (zone?.locked && s.zoneEditMode !== "erase") {
      this.callbacks.onMessage({ type: "error", text: `${zone.label} is locked.` });
      return;
    }
    const changes = createZoneColumnChanges({ world: this.session.world, columns, mode: s.zoneEditMode, zoneId: s.zoneId });
    if (changes.length > 0) this.session.applyZoneChanges(s.zoneEditMode === "erase" ? "Erase zone" : "Paint zone", changes);
  }

  private placeEntity(cell: GridCoordinate) {
    const surface = getTerrainSurfaceAt(this.session.world, cell.x, cell.z);
    if (!surface.valid) {
      this.callbacks.onMessage({ type: "error", text: "No ground to place on here." });
      return;
    }
    const draft = this.draftEntity(surface.worldPosition);
    if (!draft) {
      this.callbacks.onMessage({ type: "error", text: "Choose an object to place." });
      return;
    }
    const entity = groundIfAttached(this.session, draft);
    this.session.addEntities(`Place ${entity.name}`, [entity]);
    this.selection = [entity.id];
    this.selectionDirty = true;
    this.callbacks.onSelectionChange(this.selection);
    this.callbacks.onMessage({ type: "info", text: `${entity.name} placed.` });
    // Until the model is in memory the object shows as a placeholder box.
    if (entity.entityType === "model" && entity.assetReference && !this.models.get(entity.assetReference)) {
      void this.models.ensureLoaded([entity.assetReference]).then(() => this.refreshEntities());
    }
  }

  private placeMarker(cell: GridCoordinate) {
    const target = toolTarget(this.session.world, "marker", cell);
    if (!target) {
      this.callbacks.onMessage({ type: "error", text: "No valid cell for a marker here." });
      return;
    }
    const markers = this.session.getMeta().markers;
    const taken = new Set(markers.map((marker) => marker.id));
    let index = markers.length + 1;
    while (taken.has(`marker-${index}`)) index += 1;
    const marker: MapMarkerDefinition = {
      id: `marker-${index}`,
      type: "marker",
      markerType: "info",
      label: `Marker ${index}`,
      gridPosition: target,
      rotationY: 0,
      developmentVisible: true,
      runtimeVisible: true,
      interactionRadius: 1.1,
    };
    this.session.updateMeta("Place marker", { markers: [...markers, marker] });
    this.callbacks.onMessage({ type: "info", text: `${marker.label} placed at ${target.x},${target.y},${target.z}.` });
  }

  /** Single-shot tools act on release, where they were pressed. */
  private applyClick(tool: EditorTool, cell: GridCoordinate | null) {
    if (tool === "select") {
      this.selectedCell = cell;
      this.updateSelectedCellBox();
      this.callbacks.onCellSelect(cell);
      if (this.selection.length > 0) {
        this.selection = [];
        this.selectionDirty = true;
        this.callbacks.onSelectionChange([]);
      }
      this.invalidate();
      return;
    }
    if (!cell || this.locked(tool)) return;
    if (tool === "entity") this.placeEntity(cell);
    else if (tool === "marker") this.placeMarker(cell);
    else if (tool === "navigation") {
      this.selectedCell = cell;
      this.updateSelectedCellBox();
      this.callbacks.onCellSelect(cell);
    } else this.applyTerrain(tool, cell);
  }

  private beginSelectObject(event: PointerEvent, hit: { id: string; point: THREE.Vector3 }) {
    let next = this.selection;
    if (event.shiftKey) {
      next = next.includes(hit.id) ? next.filter((id) => id !== hit.id) : [...next, hit.id];
    } else if (!next.includes(hit.id)) {
      next = [hit.id];
    }
    if (next !== this.selection) {
      this.selection = next;
      this.selectionDirty = true;
      this.callbacks.onSelectionChange(next);
      this.invalidate();
    }
    this.selectedCell = null;
    this.updateSelectedCellBox();
    this.callbacks.onCellSelect(null);
    if (!next.includes(hit.id) || this.view.locked.has("entities")) return;

    const positions = new Map<string, { x: number; z: number; ry: number }>();
    for (const id of next) {
      const selected = this.session.getEntity(id);
      if (selected && !selected.locked) positions.set(id, { x: selected.transform.position.x, z: selected.transform.position.z, ry: selected.transform.rotation.y });
    }
    if (positions.size === 0) return;
    this.stroke = { kind: "move", startX: event.clientX, startY: event.clientY, planeY: hit.point.y, origin: hit.point.clone(), started: false, positions };
  }

  private continueMove(event: PointerEvent, stroke: Extract<Stroke, { kind: "move" }>) {
    if (!stroke.started) {
      if (Math.hypot(event.clientX - stroke.startX, event.clientY - stroke.startY) < CLICK_SLOP_PX) return;
      stroke.started = true;
      this.session.beginGroup(this.transformMode === "rotate" ? "Rotate object" : stroke.positions.size > 1 ? "Move objects" : "Move object");
    }
    if (this.transformMode === "rotate") {
      // A drag across the screen turns the object; snapped to 15 degrees unless Alt is held.
      const raw = (event.clientX - stroke.startX) * 0.012;
      const step = Math.PI / 12;
      const angle = event.altKey ? raw : Math.round(raw / step) * step;
      this.session.updateEntities("Rotate", [...stroke.positions.keys()], (entity) => {
        entity.transform.rotation.y = stroke.positions.get(entity.id)!.ry + angle;
        return entity;
      });
      return;
    }
    const ray = this.setRay(event.clientX, event.clientY);
    if (Math.abs(ray.direction.y) < 1e-6) return;
    const t = (stroke.planeY - ray.origin.y) / ray.direction.y;
    if (t <= 0) return;
    const snap = (value: number) => (event.altKey ? value : Math.round(value / MOVE_SNAP) * MOVE_SNAP);
    const dx = snap(ray.origin.x + ray.direction.x * t - stroke.origin.x);
    const dz = snap(ray.origin.z + ray.direction.z * t - stroke.origin.z);
    this.session.updateEntities("Move", [...stroke.positions.keys()], (entity) => {
      const start = stroke.positions.get(entity.id)!;
      entity.transform.position.x = start.x + dx;
      entity.transform.position.z = start.z + dz;
      return entity;
    });
  }

  private endStroke(event: PointerEvent | null) {
    const stroke = this.stroke;
    this.stroke = null;
    if (!stroke) return;
    if (stroke.kind === "move") {
      if (stroke.started) {
        // Objects that sit on the ground follow it to their new place.
        this.session.updateEntities("Ground", [...stroke.positions.keys()], (entity) => groundIfAttached(this.session, entity));
        this.session.endGroup();
      }
    } else if (stroke.kind === "click") {
      if (event && event.type === "pointerup" && Math.hypot(event.clientX - stroke.startX, event.clientY - stroke.startY) <= CLICK_SLOP_PX) {
        this.applyClick(stroke.tool, this.hoveredCell(this.setRay(event.clientX, event.clientY)));
      }
    } else if (stroke.kind === "zone-area") {
      const cell = event && event.type === "pointerup" ? this.hoveredCell(this.setRay(event.clientX, event.clientY)) : null;
      if (cell) this.applyZone(previewCells({ ...this.previewInput("zone", cell), zoneAnchor: stroke.anchor }));
      this.callbacks.onEditEnd?.();
    } else {
      this.session.endGroup();
      if (stroke.kind === "terrain" && stroke.tool !== "zone") this.callbacks.onCellSelect(this.selectedCell);
      this.callbacks.onEditEnd?.();
    }
    this.hoverKey = "";
    this.schedulePick();
  }

  private bind() {
    const { signal } = this.abort;
    const canvas = this.canvas;
    canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });

    canvas.addEventListener("pointerdown", (event) => {
      canvas.focus({ preventScroll: true });
      if (this.cleanPreview || this.baked || event.button !== 0 || event.pointerType === "touch") return;
      this.pointer = { x: event.clientX, y: event.clientY };
      const ray = this.setRay(event.clientX, event.clientY);
      const { tool } = this.settings;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Capture only keeps a drag alive outside the canvas; the tool works without it.
      }

      if (tool === "select") {
        const entity = this.pickEntity(ray);
        const voxel = this.pickVoxel(ray);
        if (entity && (!voxel || entity.distance <= voxel.distance)) {
          this.beginSelectObject(event, entity);
          return;
        }
      }
      if (tool === "zone" && this.settings.zoneSelectionMode === "rectangle") {
        const anchor = this.hoveredCell(ray);
        if (anchor && !this.locked(tool)) {
          this.stroke = { kind: "zone-area", anchor };
          this.hoverKey = "";
          this.schedulePick();
        }
        return;
      }
      const continuous = !isSingleShot(tool) || (repeatsWithCtrl(tool) && event.ctrlKey);
      if (!continuous) {
        this.stroke = { kind: "click", tool, startX: event.clientX, startY: event.clientY };
        return;
      }
      const cell = this.hoveredCell(ray);
      if (!cell || this.locked(tool)) return;
      this.session.beginGroup(tool === "zone" ? (this.settings.zoneEditMode === "erase" ? "Erase zone" : "Paint zone") : TERRAIN_LABELS[tool]);
      const target = toolTarget(this.session.world, tool, cell);
      this.stroke = {
        kind: "terrain",
        tool,
        lastKey: `${cell.x},${cell.y},${cell.z}`,
        touched: new Set(),
        flattenY: tool === "flatten" ? target?.y ?? cell.y : null,
        lastStep: { x: event.clientX, y: event.clientY },
      };
      if (tool === "zone") this.applyZone(previewCells(this.previewInput("zone", cell)));
      else this.applyTerrain(tool, cell);
    }, { signal });

    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      this.pointer = { x: event.clientX, y: event.clientY };
      const stroke = this.stroke;
      if (stroke?.kind === "move") {
        this.continueMove(event, stroke);
        return;
      }
      if (stroke?.kind === "terrain" && (event.buttons & 1) === 1) {
        const { tool } = stroke;
        // Repeated add and erase (Ctrl) step only after the pointer has travelled a little.
        if (repeatsWithCtrl(tool) && stroke.lastStep && Math.hypot(event.clientX - stroke.lastStep.x, event.clientY - stroke.lastStep.y) < REPEAT_STEP_PX) {
          this.schedulePick();
          return;
        }
        const cell = this.hoveredCell(this.setRay(event.clientX, event.clientY));
        // Raise and lower change the hovered cell's height; compare columns so one pass over a column is one step.
        const key = cell ? (tool === "raise" || tool === "lower" || tool === "add" ? `${cell.x},${cell.z}` : `${cell.x},${cell.y},${cell.z}`) : "";
        if (cell && key !== stroke.lastKey) {
          stroke.lastKey = key;
          stroke.lastStep = { x: event.clientX, y: event.clientY };
          if (tool === "zone") this.applyZone(previewCells(this.previewInput("zone", cell)));
          else this.applyTerrain(tool, cell);
        }
      }
      this.schedulePick();
    }, { signal });

    canvas.addEventListener("pointerup", (event) => this.endStroke(event), { signal });
    canvas.addEventListener("pointercancel", () => this.endStroke(null), { signal });
    canvas.addEventListener("pointerleave", () => {
      if (this.stroke) return;
      this.pointer = null;
      this.hoverKey = "";
      this.clearPreview();
      this.callbacks.onHover(null);
    }, { signal });
  }
}

const TERRAIN_LABELS: Record<EditorTool, string> = {
  select: "Select",
  paint: "Paint terrain",
  add: "Add blocks",
  erase: "Erase blocks",
  raise: "Raise terrain",
  lower: "Lower terrain",
  flatten: "Flatten terrain",
  clear: "Clear terrain",
  zone: "Paint zone",
  marker: "Place marker",
  entity: "Place object",
  navigation: "Navigation",
};

/** Puts a surface-attached entity on the terrain under it; other entities are returned unchanged. */
export function groundIfAttached(session: EditorSession, entity: PlacedMapEntity): PlacedMapEntity {
  if (!entity.placement.surfaceAttached) return entity;
  if (entity.entityType === "model") {
    // A model's anchor is its base (or its centre): it stands on the top of the column under it.
    const world = session.world;
    const cell = world.worldToGrid({ x: entity.transform.position.x, y: 0, z: entity.transform.position.z });
    const top = cell ? world.getHighestNonAirY(cell.x, cell.z) : null;
    if (top === null) return entity;
    entity.transform.position.y = top + 1 + (entity.placement.anchor === "center" ? entity.footprint.height / 2 : 0);
    return entity;
  }
  const grounded = groundEntityOnTerrain(session.world, entity);
  return grounded.ok ? grounded.entity : entity;
}
