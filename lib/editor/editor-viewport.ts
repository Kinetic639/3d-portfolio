import * as THREE from "three";
import { decodeBakedWorld } from "@/lib/bake/baked-format";
import { createBakedTerrain } from "@/lib/engine/baked-terrain";
import { CameraRig, VISITOR_CAMERA } from "@/lib/engine/camera-rig";
import { buildEntityLayer, type EntityLayer } from "@/lib/engine/entity-meshes";
import { Environment } from "@/lib/engine/environment";
import type { ModelLibrary } from "@/lib/engine/model-library";
import type { TerrainSource } from "@/lib/engine/terrain-meshes";
import { createPlacedEntity, type PlacedMapEntity } from "@/lib/maps/map-entities";
import { getPrefabDefinition } from "@/lib/prefabs/prefab-library";
import { groundEntityOnTerrain } from "@/lib/prefabs/prefab-placement";
import { buildZoneOverlayChunkMeshes } from "@/lib/terrain/zone-overlay";
import { DEFAULT_SHAPE_ID, type CellRotation, type ShapeId } from "@/lib/voxel-shapes/shape-ids";
import { getDefaultShapeState } from "@/lib/voxel-shapes/shape-registry";
import { BLOCK_IDS, getBlockDefinition, type BlockId } from "@/lib/world/block-registry";
import { raycastVoxels } from "@/lib/world/voxel-raycast";
import { getChunkCounts, type GridCoordinate } from "@/lib/world/world-config";
import { createPrefabEntityFromDraft } from "./entity-authoring";
import type { EditorSession, SessionChange } from "./editor-session";
import { createTerrainMutations, getBrushFootprint, type TerrainBrushSettings, type TerrainCellMutation } from "./terrain-brushes";
import { createZoneColumnChanges } from "./zone-tools";

/**
 * The editor's 3D view. Plain three.js, no React: the UI hands it tool
 * settings and reads back selection and hover through callbacks.
 *
 * It renders on demand, and every edit costs in proportion to what changed:
 * the session reports dirty chunks and entities, and only those are rebuilt,
 * once per frame however many edits arrived in between.
 */
export type EditorTool = "select" | "block" | "erase" | "paint" | "raise" | "lower" | "zone" | "object";

export type ToolSettings = {
  tool: EditorTool;
  blockId: BlockId;
  shapeId: ShapeId;
  rotation: CellRotation;
  brushShape: "square" | "circle";
  brushSize: number;
  /** Numeric zone id painted by the zone tool. */
  zoneId: number;
  zoneMode: "paint" | "erase";
  /** The object the object tool places: a procedural prefab or a model, never both. */
  prefabId: string | null;
  modelId: string | null;
  variantId: string | null;
};

export type HoverInfo = {
  cell: GridCoordinate | null;
  blockName: string | null;
  zoneId: number;
  entityId: string | null;
};

export type ViewportCallbacks = {
  onSelectionChange: (ids: string[]) => void;
  onHover: (info: HoverInfo | null) => void;
};

export type ViewportStats = {
  frames: number;
  picks: number;
  chunkRebuilds: number;
  zoneChunkRebuilds: number;
  entityRebuilds: number;
  /** CPU time of the last frame, including any rebuilds it performed, ms. */
  lastFrameMs: number;
  /** Longest frame since `resetWorstFrame()`, ms. */
  worstFrameMs: number;
};

export const MAX_BRUSH_SIZE = 31;
const PREVIEW_CAPACITY = MAX_BRUSH_SIZE * MAX_BRUSH_SIZE;
const DRAG_SLOP_PX = 4;
const MOVE_SNAP = 0.5;
/** How the camera behaves while editing: any distance, any angle up to straight overhead, exact panning. */
const EDITOR_CAMERA = { panButtons: [1, 2], minDistance: 6, maxDistance: 380, minPitchDegrees: 8, maxPitchDegrees: 89, targetHeight: 0, panSpeed: 1, rotateKeys: false };
const EDITOR_ZOOM = EDITOR_CAMERA;

type Stroke =
  | {
      kind: "terrain";
      layerY: number | null;
      lastKey: string;
      /** Columns already raised or lowered in this stroke, so overlapping brush steps move each column once. */
      touched: Set<string>;
    }
  | {
      kind: "move";
      startX: number;
      startY: number;
      planeY: number;
      origin: THREE.Vector3;
      started: boolean;
      positions: Map<string, { x: number; z: number }>;
    };

export class EditorViewport {
  readonly stats: ViewportStats = { frames: 0, picks: 0, chunkRebuilds: 0, zoneChunkRebuilds: 0, entityRebuilds: 0, lastFrameMs: 0, worstFrameMs: 0 };
  readonly camera: THREE.PerspectiveCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly session: EditorSession;
  private readonly terrain: TerrainSource;
  private readonly callbacks: ViewportCallbacks;
  private readonly models: ModelLibrary;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly environment: Environment;
  private readonly rig: CameraRig;
  private readonly raycaster = new THREE.Raycaster();
  private readonly overlays = new THREE.Group();
  private readonly zoneGroup = new THREE.Group();
  private readonly zoneChunks = new Map<string, THREE.Object3D[]>();
  private readonly zoneMaterials = new Map<number, { fill: THREE.MeshBasicMaterial; line: THREE.LineBasicMaterial }>();
  private readonly brushPreview: THREE.InstancedMesh;
  private readonly selectionOutline: THREE.LineSegments;
  private readonly boundsOutline: THREE.LineSegments;
  private readonly resizeObserver: ResizeObserver;
  private readonly abort = new AbortController();
  private readonly unsubscribe: () => void;
  private entities: EntityLayer;
  private settings: ToolSettings;
  private selection: string[] = [];
  private preview = false;
  /** The baked terrain, while the baked view is on. Editing is off in that view. */
  private baked: TerrainSource | null = null;
  private viewBeforePreview: ReturnType<CameraRig["getGoal"]> | null = null;
  private zonesVisible = true;
  private pointer: { x: number; y: number } | null = null;
  private hoverKey = "";
  private stroke: Stroke | null = null;
  private readonly dirtyTerrain = new Set<string>();
  private readonly dirtyZones = new Set<string>();
  private entitiesDirty = false;
  private selectionDirty = false;
  private pickPending = false;
  private frameHandle = 0;
  private lastTickAt = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, session: EditorSession, terrain: TerrainSource, models: ModelLibrary, settings: ToolSettings, callbacks: ViewportCallbacks) {
    this.canvas = canvas;
    this.session = session;
    this.terrain = terrain;
    this.settings = settings;
    this.callbacks = callbacks;
    this.models = models;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.environment = new Environment(this.scene);

    this.rig = new CameraRig(canvas, { onChange: () => this.invalidate(), ...EDITOR_CAMERA, initialDistance: 90 });
    this.camera = this.rig.camera;

    this.entities = buildEntityLayer(session.getEntities(), models);
    this.scene.add(terrain.group, this.entities.group, this.overlays);

    const previewMaterial = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.4, depthWrite: false });
    this.brushPreview = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), previewMaterial, PREVIEW_CAPACITY);
    this.brushPreview.count = 0;
    this.brushPreview.frustumCulled = false;
    this.brushPreview.renderOrder = 3;

    const outlineMaterial = (color: string) => new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });
    this.selectionOutline = new THREE.LineSegments(new THREE.BufferGeometry(), outlineMaterial("#ffd24a"));
    this.selectionOutline.frustumCulled = false;
    this.selectionOutline.renderOrder = 4;
    this.boundsOutline = new THREE.LineSegments(new THREE.BufferGeometry(), outlineMaterial("#ff6b4a"));
    this.boundsOutline.frustumCulled = false;
    this.boundsOutline.renderOrder = 2;
    this.overlays.add(this.zoneGroup, this.brushPreview, this.selectionOutline, this.boundsOutline);

    this.applyMeta();
    const counts = getChunkCounts(session.world.config);
    for (let chunkZ = 0; chunkZ < counts.z; chunkZ += 1) {
      for (let chunkX = 0; chunkX < counts.x; chunkX += 1) this.rebuildZoneChunk(session.world.getChunkId(chunkX, chunkZ));
    }
    this.stats.zoneChunkRebuilds = 0;
    this.applyCameraMode();
    this.frameAll(true);

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

  setSettings(settings: ToolSettings) {
    this.settings = settings;
    this.hoverKey = "";
    this.schedulePick();
  }

  setSelection(ids: string[]) {
    this.selection = ids.filter((id) => this.session.getEntity(id));
    this.selectionDirty = true;
    this.invalidate();
  }

  /** Visitor preview: hides every editor overlay and applies the visitor's camera limits and fog. */
  setPreview(preview: boolean) {
    if (this.preview === preview) return;
    this.preview = preview;
    this.stroke = null;
    this.overlays.visible = !preview;
    this.applyCameraMode();
    if (preview) {
      this.viewBeforePreview = this.rig.getGoal();
      const bounds = this.playableWorldBounds();
      this.rig.setOrientation(VISITOR_CAMERA.yawDegrees, VISITOR_CAMERA.pitchDegrees, true);
      this.rig.lookAt((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2, VISITOR_CAMERA.initialDistance, true);
      this.setPreviewCells([], false);
    } else if (this.viewBeforePreview) {
      const { x, z, distance, yawDegrees, pitchDegrees } = this.viewBeforePreview;
      this.rig.setOrientation(yawDegrees, pitchDegrees, true);
      this.rig.lookAt(x, z, distance, true);
    }
    this.invalidate();
  }

  setZonesVisible(visible: boolean) {
    this.zonesVisible = visible;
    this.zoneGroup.visible = visible && this.baked === null;
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
    this.terrain.group.visible = this.baked === null;
    this.zoneGroup.visible = this.zonesVisible && this.baked === null;
    this.stroke = null;
    this.hoverKey = "";
    this.setPreviewCells([], false);
    this.callbacks.onHover(null);
    this.canvas.style.cursor = "default";
    this.invalidate();
  }

  /** Centres the camera on the playable area. */
  frameAll(immediate = false) {
    const bounds = this.playableWorldBounds();
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
    this.rig.lookAt((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2, THREE.MathUtils.clamp(span * 1.9, 30, EDITOR_ZOOM.maxDistance), immediate);
  }

  focusEntity(id: string) {
    const entity = this.session.getEntity(id);
    if (entity) this.rig.lookAt(entity.transform.position.x, entity.transform.position.z, 40);
  }

  /** Client coordinates of a world point. Used by tests and by nothing else. */
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

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.abort.abort();
    this.unsubscribe();
    this.resizeObserver.disconnect();
    this.rig.dispose();
    this.entities.dispose();
    this.baked?.dispose();
    this.terrain.dispose();
    for (const id of [...this.zoneChunks.keys()]) this.clearZoneChunk(id);
    this.zoneMaterials.forEach(({ fill, line }) => {
      fill.dispose();
      line.dispose();
    });
    for (const object of [this.brushPreview, this.selectionOutline, this.boundsOutline]) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
    this.brushPreview.dispose();
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
      this.entities = buildEntityLayer(this.session.getEntities(), this.models);
      this.scene.add(this.entities.group);
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
    this.renderer.render(this.scene, this.camera);
    this.stats.frames += 1;
    this.stats.lastFrameMs = performance.now() - startedAt;
    this.stats.worstFrameMs = Math.max(this.stats.worstFrameMs, this.stats.lastFrameMs);
    if (moving) {
      this.schedulePick();
      this.invalidate();
    } else {
      this.lastTickAt = 0;
    }
  }

  private resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.rig.setAspect(width / height);
    this.invalidate();
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

  private applyCameraMode() {
    const { width, depth } = this.session.world.config;
    if (this.preview) {
      const { panButtons, minDistance, maxDistance, minPitchDegrees, maxPitchDegrees, targetHeight, panSpeed } = VISITOR_CAMERA;
      this.rig.configure({ panButtons, minDistance, maxDistance, minPitchDegrees, maxPitchDegrees, targetHeight, panSpeed, rotateKeys: true });
      this.rig.setBounds(this.playableWorldBounds());
    } else {
      this.rig.configure(EDITOR_CAMERA);
      this.rig.setBounds({ minX: -width / 2, maxX: width / 2, minZ: -depth / 2, maxZ: depth / 2 });
    }
  }

  private applyMeta() {
    const meta = this.session.getMeta();
    this.environment.apply(meta.environment);
    for (const zone of meta.zones) {
      const materials = this.zoneMaterials.get(zone.numericId);
      if (materials) {
        materials.fill.color.set(zone.color);
        materials.line.color.set(zone.color);
      }
    }
    const { minX, maxX, minZ, maxZ } = this.playableWorldBounds();
    const y = 1.05;
    const corners = [minX, y, minZ, maxX, y, minZ, maxX, y, minZ, maxX, y, maxZ, maxX, y, maxZ, minX, y, maxZ, minX, y, maxZ, minX, y, minZ];
    this.boundsOutline.geometry.setAttribute("position", new THREE.Float32BufferAttribute(corners, 3));
    if (this.preview) this.rig.setBounds({ minX, maxX, minZ, maxZ });
  }

  private zoneMaterial(numericId: number) {
    let materials = this.zoneMaterials.get(numericId);
    if (!materials) {
      const color = this.session.getMeta().zones.find((zone) => zone.numericId === numericId)?.color ?? "#ff00ff";
      materials = {
        fill: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, depthWrite: false }),
        line: new THREE.LineBasicMaterial({ color }),
      };
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
    let best: { id: string; distance: number; point: THREE.Vector3 } | null = null;
    const point = new THREE.Vector3();
    for (const [id, box] of this.entities.bounds) {
      if (!ray.intersectBox(box, point)) continue;
      const distance = point.distanceTo(ray.origin);
      if (!best || distance < best.distance) best = { id, distance, point: point.clone() };
    }
    return best;
  }

  /** The cell under the ray in a fixed horizontal layer, or null outside the map. */
  private cellOnLayer(ray: THREE.Ray, layerY: number): GridCoordinate | null {
    if (Math.abs(ray.direction.y) < 1e-6) return null;
    const t = (layerY + 0.5 - ray.origin.y) / ray.direction.y;
    if (t <= 0) return null;
    const { width, depth } = this.session.world.config;
    const x = Math.floor(ray.origin.x + ray.direction.x * t + width / 2);
    const z = Math.floor(ray.origin.z + ray.direction.z * t + depth / 2);
    return x >= 0 && x < width && z >= 0 && z < depth ? { x, y: layerY, z } : null;
  }

  private brush(): Partial<TerrainBrushSettings> {
    const size = THREE.MathUtils.clamp(Math.round(this.settings.brushSize), 1, MAX_BRUSH_SIZE);
    return { shape: size <= 1 ? "single" : this.settings.brushShape, size };
  }

  /**
   * The cell the active terrain tool would act on. Block and erase strokes stay
   * in the layer they started in, so dragging lays a flat run instead of
   * climbing over the blocks just placed.
   */
  private toolTarget(ray: THREE.Ray): GridCoordinate | null {
    const { tool } = this.settings;
    const layerY = this.stroke?.kind === "terrain" ? this.stroke.layerY : null;
    if (layerY !== null && (tool === "block" || tool === "erase")) return this.cellOnLayer(ray, layerY);
    const hit = this.pickVoxel(ray);
    if (!hit) return null;
    if (tool === "block") {
      const target = { x: hit.cell.x + hit.normal.x, y: hit.cell.y + hit.normal.y, z: hit.cell.z + hit.normal.z };
      return this.session.world.isInsideWorld(target.x, target.y, target.z) ? target : null;
    }
    return hit.cell;
  }

  private schedulePick() {
    if (!this.pointer || this.preview || this.baked) return;
    this.pickPending = true;
    this.invalidate();
  }

  private updateHover() {
    if (!this.pointer || this.preview || this.baked) {
      this.setPreviewCells([], false);
      return;
    }
    const ray = this.setRay(this.pointer.x, this.pointer.y);
    const world = this.session.world;
    const { tool } = this.settings;

    if (tool === "select") {
      const entity = this.pickEntity(ray);
      const voxel = this.pickVoxel(ray);
      const entityWins = entity && (!voxel || entity.distance <= voxel.distance);
      this.setPreviewCells([], false);
      this.canvas.style.cursor = entityWins ? "pointer" : "default";
      const key = entityWins ? `e:${entity.id}` : voxel ? `c:${voxel.cell.x},${voxel.cell.y},${voxel.cell.z}` : "";
      if (key === this.hoverKey) return;
      this.hoverKey = key;
      this.callbacks.onHover(entityWins
        ? { cell: null, blockName: null, zoneId: 0, entityId: entity.id }
        : voxel ? this.describeCell(voxel.cell) : null);
      return;
    }

    this.canvas.style.cursor = "crosshair";
    const target = this.toolTarget(ray);
    const key = target ? `t:${tool}:${target.x},${target.y},${target.z}:${this.settings.brushSize}:${this.settings.brushShape}` : "";
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    if (!target) {
      this.setPreviewCells([], false);
      this.callbacks.onHover(null);
      return;
    }
    this.callbacks.onHover(this.describeCell(target));

    if (tool === "object") {
      const top = world.getHighestNonAirY(target.x, target.z) ?? target.y;
      this.setPreviewCells([{ x: target.x, y: top, z: target.z }], false);
      return;
    }
    const footprint = getBrushFootprint(target, { ...this.brushSettings() }, world.config);
    if (tool === "block" || tool === "erase") {
      this.setPreviewCells(footprint, true);
    } else {
      this.setPreviewCells(footprint.map((cell) => ({
        x: cell.x,
        y: world.getBlock(cell.x, target.y, cell.z) !== BLOCK_IDS.Air ? target.y : world.getHighestNonAirY(cell.x, cell.z) ?? target.y,
        z: cell.z,
      })), false);
    }
  }

  private brushSettings(): TerrainBrushSettings {
    return { shape: "single", size: 1, pathWidth: 1, pathEnds: "square", flattenHeight: 0, ...this.brush() };
  }

  private describeCell(cell: GridCoordinate): HoverInfo {
    const world = this.session.world;
    const blockId = world.getBlock(cell.x, cell.y, cell.z);
    return {
      cell,
      blockName: blockId === BLOCK_IDS.Air ? null : getBlockDefinition(blockId)?.displayName ?? String(blockId),
      zoneId: world.getColumnZone(cell.x, cell.z),
      entityId: null,
    };
  }

  /** Shows the brush footprint: whole cells for block and erase, a thin plate on top of the cell otherwise. */
  private setPreviewCells(cells: GridCoordinate[], full: boolean) {
    const count = Math.min(cells.length, PREVIEW_CAPACITY);
    if (count === 0 && this.brushPreview.count === 0) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1.02, full ? 1.02 : 0.08, 1.02);
    const rotation = new THREE.Quaternion();
    for (let index = 0; index < count; index += 1) {
      const cell = cells[index];
      const centre = this.session.world.gridToWorld(cell.x, cell.y, cell.z);
      matrix.compose(position.set(centre.x, centre.y + (full ? 0 : 0.5), centre.z), rotation, scale);
      this.brushPreview.setMatrixAt(index, matrix);
    }
    this.brushPreview.count = count;
    this.brushPreview.instanceMatrix.needsUpdate = true;
    (this.brushPreview.material as THREE.MeshBasicMaterial).color.set(this.settings.tool === "erase" || this.settings.tool === "lower" ? "#ff5a4a" : "#ffffff");
    this.invalidate();
  }

  // --- tools -------------------------------------------------------------------

  private applyTerrainTool(target: GridCoordinate) {
    const world = this.session.world;
    const { tool, blockId, shapeId, rotation } = this.settings;
    const brush = this.brush();
    const single = { shape: "single" as const, size: 1 };
    const touched = this.stroke?.kind === "terrain" ? this.stroke.touched : new Set<string>();
    let columns = getBrushFootprint(target, this.brushSettings(), world.config);
    if (tool === "raise" || tool === "lower") {
      columns = columns.filter((column) => !touched.has(`${column.x},${column.z}`));
      for (const column of columns) touched.add(`${column.x},${column.z}`);
    }

    switch (tool) {
      case "block": {
        const mutations = createTerrainMutations({
          world, operation: "fill", center: target, settings: brush, blockId, shapeId, rotation, state: getDefaultShapeState(shapeId), zoneId: 0,
        }).filter((mutation) => mutation.beforeBlock === BLOCK_IDS.Air);
        this.session.applyTerrain("Place blocks", mutations);
        break;
      }
      case "erase":
        this.session.applyTerrain("Remove blocks", createTerrainMutations({ world, operation: "erase", center: target, settings: brush, blockId: BLOCK_IDS.Air, zoneId: 0 }));
        break;
      case "paint": {
        const mutations: TerrainCellMutation[] = [];
        for (const column of columns) {
          const y = world.getBlock(column.x, target.y, column.z) !== BLOCK_IDS.Air ? target.y : world.getHighestNonAirY(column.x, column.z);
          if (y === null) continue;
          mutations.push(...createTerrainMutations({ world, operation: "paint", center: { x: column.x, y, z: column.z }, settings: single, blockId, zoneId: 0 }));
        }
        this.session.applyTerrain("Paint blocks", mutations);
        break;
      }
      case "raise": {
        const mutations: TerrainCellMutation[] = [];
        for (const column of columns) {
          const top = world.getHighestNonAirY(column.x, column.z);
          // A raised column continues with the material it already has on top.
          const material = top === null ? blockId : world.getBlock(column.x, top, column.z);
          mutations.push(...createTerrainMutations({
            world, operation: "raise", center: { x: column.x, y: top ?? world.config.minY, z: column.z }, settings: single, blockId: material, shapeId: DEFAULT_SHAPE_ID, zoneId: 0,
          }));
        }
        this.session.applyTerrain("Raise terrain", mutations);
        break;
      }
      case "lower": {
        const mutations: TerrainCellMutation[] = [];
        for (const column of columns) {
          mutations.push(...createTerrainMutations({
            world, operation: "lower", center: { x: column.x, y: world.getHighestNonAirY(column.x, column.z) ?? world.config.minY, z: column.z }, settings: single, blockId: BLOCK_IDS.Air, zoneId: 0,
          }));
        }
        this.session.applyTerrain("Lower terrain", mutations);
        break;
      }
      case "zone": {
        const erase = this.settings.zoneMode === "erase";
        this.session.applyZoneChanges(erase ? "Erase zone" : "Paint zone", createZoneColumnChanges({
          world, columns, mode: erase ? "erase" : "replace", zoneId: this.settings.zoneId,
        }));
        break;
      }
    }
  }

  /** Rebuilds the objects, e.g. after a model finished loading. */
  refreshEntities() {
    this.entitiesDirty = true;
    this.invalidate();
  }

  private placeModel(target: GridCoordinate, modelId: string) {
    const entry = this.models.entry(modelId);
    if (!entry) return;
    const world = this.session.world;
    const top = world.getHighestNonAirY(target.x, target.z) ?? target.y;
    const centre = world.gridToWorld(target.x, top, target.z);
    const variant = entry.variants.find((candidate) => candidate.id === this.settings.variantId);
    const scale = entry.scale * (variant?.scale ?? 1);
    const size = [0, 1, 2].map((axis) => Math.max(0.1, (entry.bounds.max[axis] - entry.bounds.min[axis]) * scale));
    const taken = new Set(this.session.getEntities().map((entity) => entity.id));
    let id = entry.id;
    for (let suffix = 2; taken.has(id); suffix += 1) id = `${entry.id}-${suffix}`;
    const entity = createPlacedEntity({
      id,
      name: entry.name,
      entityType: "model",
      assetReference: entry.id,
      variantId: variant?.id,
      transform: {
        position: { x: centre.x, y: centre.y + 0.5 + (entry.anchor === "center" ? size[1] / 2 : 0), z: centre.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      placement: { anchor: entry.anchor, snapToGrid: true, surfaceAttached: true, surfaceOffset: 0 },
      footprint: { width: size[0], height: size[1], depth: size[2] },
      collisionMode: entry.collision,
      tags: ["model", ...entry.tags],
    });
    this.session.addEntities(`Place ${entry.name}`, [entity]);
    this.selection = [entity.id];
    this.selectionDirty = true;
    this.callbacks.onSelectionChange(this.selection);
    // Until the model is in memory the object shows as a placeholder box.
    if (!this.models.get(entry.id)) void this.models.ensureLoaded([entry.id]).then(() => this.refreshEntities());
  }

  private placeObject(target: GridCoordinate) {
    if (this.settings.modelId) {
      this.placeModel(target, this.settings.modelId);
      return;
    }
    const { prefabId, variantId } = this.settings;
    const prefab = prefabId ? getPrefabDefinition(prefabId) : null;
    if (!prefab) return;
    const world = this.session.world;
    const top = world.getHighestNonAirY(target.x, target.z) ?? target.y;
    const centre = world.gridToWorld(target.x, top, target.z);
    const draft = createPrefabEntityFromDraft({
      prefabId: prefab.id,
      variantId: variantId ?? prefab.defaultVariantId,
      name: prefab.name,
      transform: { position: { x: centre.x, y: centre.y + 0.5, z: centre.z }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    }, new Set(this.session.getEntities().map((entity) => entity.id)));
    const grounded = groundEntityOnTerrain(world, draft);
    const entity = grounded.ok ? grounded.entity : draft;
    this.session.addEntities(`Place ${prefab.name}`, [entity]);
    this.selection = [entity.id];
    this.selectionDirty = true;
    this.callbacks.onSelectionChange(this.selection);
  }

  private beginSelect(event: PointerEvent, ray: THREE.Ray) {
    const entity = this.pickEntity(ray);
    const voxel = this.pickVoxel(ray);
    const hit = entity && (!voxel || entity.distance <= voxel.distance) ? entity : null;
    let next = this.selection;
    if (!hit) {
      if (!event.shiftKey) next = [];
    } else if (event.shiftKey) {
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
    if (!hit || !next.includes(hit.id)) return;

    const positions = new Map<string, { x: number; z: number }>();
    for (const id of next) {
      const selected = this.session.getEntity(id);
      if (selected && !selected.locked) positions.set(id, { x: selected.transform.position.x, z: selected.transform.position.z });
    }
    if (positions.size === 0) return;
    this.stroke = { kind: "move", startX: event.clientX, startY: event.clientY, planeY: hit.point.y, origin: hit.point.clone(), started: false, positions };
  }

  private continueMove(event: PointerEvent, stroke: Extract<Stroke, { kind: "move" }>) {
    if (!stroke.started) {
      if (Math.hypot(event.clientX - stroke.startX, event.clientY - stroke.startY) < DRAG_SLOP_PX) return;
      stroke.started = true;
      this.session.beginGroup(stroke.positions.size > 1 ? "Move objects" : "Move object");
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

  private endStroke() {
    const stroke = this.stroke;
    this.stroke = null;
    if (!stroke) return;
    if (stroke.kind === "move") {
      if (!stroke.started) return;
      // Objects that sit on the ground follow it to their new place.
      this.session.updateEntities("Ground", [...stroke.positions.keys()], (entity) => groundIfAttached(this.session, entity));
    }
    this.session.endGroup();
    this.hoverKey = "";
    this.schedulePick();
  }

  private bind() {
    const { signal } = this.abort;
    const canvas = this.canvas;
    canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });

    canvas.addEventListener("pointerdown", (event) => {
      canvas.focus({ preventScroll: true });
      if (this.preview || this.baked || event.button !== 0 || event.pointerType === "touch") return;
      this.pointer = { x: event.clientX, y: event.clientY };
      const ray = this.setRay(event.clientX, event.clientY);
      const { tool } = this.settings;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Capture only keeps a drag alive outside the canvas; the tool works without it.
      }

      if (tool === "select") {
        this.beginSelect(event, ray);
        return;
      }
      const target = this.toolTarget(ray);
      if (!target) return;
      if (tool === "object") {
        this.placeObject(target);
        return;
      }
      const labels: Record<string, string> = { block: "Place blocks", erase: "Remove blocks", paint: "Paint blocks", raise: "Raise terrain", lower: "Lower terrain", zone: this.settings.zoneMode === "erase" ? "Erase zone" : "Paint zone" };
      this.session.beginGroup(labels[tool]);
      this.stroke = { kind: "terrain", layerY: tool === "block" || tool === "erase" ? target.y : null, lastKey: `${target.x},${target.y},${target.z}`, touched: new Set() };
      this.applyTerrainTool(target);
    }, { signal });

    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      this.pointer = { x: event.clientX, y: event.clientY };
      const stroke = this.stroke;
      if (stroke?.kind === "move") {
        this.continueMove(event, stroke);
        return;
      }
      if (stroke?.kind === "terrain") {
        const target = this.toolTarget(this.setRay(event.clientX, event.clientY));
        const key = target ? `${target.x},${target.y},${target.z}` : "";
        // Raise and lower change the hit cell's height; compare columns so one pass over a column is one step.
        const columnKey = target ? `${target.x},${target.z}` : "";
        const perColumn = stroke.layerY === null;
        const previous = perColumn ? stroke.lastKey.split(",").filter((_, index) => index !== 1).join(",") : stroke.lastKey;
        if (target && (perColumn ? columnKey : key) !== previous) {
          stroke.lastKey = key;
          this.applyTerrainTool(target);
        }
      }
      this.schedulePick();
    }, { signal });

    const release = () => this.endStroke();
    canvas.addEventListener("pointerup", release, { signal });
    canvas.addEventListener("pointercancel", release, { signal });
    canvas.addEventListener("pointerleave", () => {
      if (this.stroke) return;
      this.pointer = null;
      this.hoverKey = "";
      this.setPreviewCells([], false);
      this.callbacks.onHover(null);
    }, { signal });
  }
}

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
